import { Kernel, KernelMessage, ServiceManager } from '@jupyterlab/services';

export interface IRunResult {
  output: string;
  /** Rich outputs as data URIs (e.g. "data:image/png;base64,…"). */
  images: string[];
  errored: boolean;
  errorName?: string;
}

export function normalizeOutput(s: string): string {
  return s
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/\n{2,}/g, '\n')
    .replace(/\n+$/g, '')
    .trim();
}

export class KernelRunner {
  private _services: ServiceManager.IManager;
  private _kernel: Kernel.IKernelConnection | null = null;

  constructor(services: ServiceManager.IManager) {
    this._services = services;
  }

  get hasKernel(): boolean {
    return this._kernel !== null;
  }

  async ready(): Promise<void> {
    if (this._kernel) {
      return;
    }
    await this._services.ready;
    let name = 'python3';
    try {
      await this._services.kernelspecs.ready;
      name = this._services.kernelspecs.specs?.default ?? 'python3';
    } catch {
      // fall back to python3
    }
    this._kernel = await this._services.kernels.startNew({ name });
  }

  async run(code: string): Promise<IRunResult> {
    await this.ready();
    const kernel = this._kernel as Kernel.IKernelConnection;
    const future = kernel.requestExecute({ code, stop_on_error: false });

    let output = '';
    const images: string[] = [];
    let errored = false;
    let errorName: string | undefined;

    future.onIOPub = (msg: KernelMessage.IIOPubMessage): void => {
      const type = msg.header.msg_type;
      const content: any = msg.content;
      if (type === 'stream') {
        output += content.text ?? '';
      } else if (type === 'execute_result' || type === 'display_data') {
        const data = content.data ?? {};
        const png = data['image/png'];
        if (png) {
          const b64 = Array.isArray(png) ? png.join('') : png;
          images.push(`data:image/png;base64,${b64}`);
        } else {
          const plain = data['text/plain'];
          if (plain) {
            output += Array.isArray(plain) ? plain.join('') : plain;
          }
        }
      } else if (type === 'error') {
        errored = true;
        errorName = content.ename;
        output += `${content.ename}: ${content.evalue}`;
      }
    };

    await future.done;
    return { output, images, errored, errorName };
  }

  async restart(): Promise<void> {
    if (this._kernel) {
      await this._kernel.restart();
    }
  }

  dispose(): void {
    if (this._kernel) {
      void this._kernel.shutdown().catch(() => undefined);
      this._kernel.dispose();
      this._kernel = null;
    }
  }
}
