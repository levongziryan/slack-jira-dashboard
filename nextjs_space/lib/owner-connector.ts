// Отдаёт Slack user-токен из единого слоя настроек (lib/config.ts).
// Сигнатура сохранена, чтобы вызовы getOwnerConnectorToken({ service: 'SLACK' }) по коду не менять.
import { getSlackToken } from '@/lib/config';

export async function getOwnerConnectorToken(
  body: { service: string; genericOauthService?: string; configConnector?: string },
  userId?: string,
): Promise<string> {
  if (body.service === 'SLACK') {
    const token = await getSlackToken(userId);
    if (!token) {
      throw new Error('Slack-токен не задан. Добавьте user-токен (xoxp-...) в настройках.');
    }
    return token;
  }
  throw new Error(`Unknown connector service: ${body.service}`);
}
