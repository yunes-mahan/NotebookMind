import json

from jupyter_server.base.handlers import APIHandler
from jupyter_server.utils import url_path_join
import tornado

from .config import get_config


class ConfigHandler(APIHandler):
    @tornado.web.authenticated
    def get(self):
        self.finish(json.dumps(get_config()))


def setup_handlers(web_app):
    host_pattern = '.*$'
    base_url = web_app.settings['base_url']
    config_pattern = url_path_join(base_url, 'notebookmind', 'config')
    handlers = [(config_pattern, ConfigHandler)]
    web_app.add_handlers(host_pattern, handlers)
