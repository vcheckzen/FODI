import { cacheRequest } from './handlers/request-handler';
import { fetchAccessToken } from './services/utils';

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext) {
    try {
      return cacheRequest(request, env, ctx);
    } catch (e: any) {
      return Response.json({ error: e.message });
    }
  },

  async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(fetchAccessToken(env.OAUTH, env.FODI_CACHE));
  },
};
