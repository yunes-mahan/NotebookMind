try:
    from ._version import __version__
except ImportError:
    import warnings
    warnings.warn("Importing 'notebookmind' outside a proper installation.")
    __version__ = 'dev'
from .handlers import setup_handlers


def _jupyter_labextension_paths():
    return [{'src': 'labextension', 'dest': 'notebookmind'}]


def _jupyter_server_extension_points():
    return [{'module': 'notebookmind'}]


def _load_jupyter_server_extension(server_app):
    setup_handlers(server_app.web_app)
    server_app.log.info('Registered notebookmind server extension')
