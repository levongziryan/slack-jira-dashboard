// Self-host: отдаёт Slack user-токен из переменной окружения вместо
// запроса к Abacus Connector API. Сигнатура оставлена прежней, чтобы
// вызовы getOwnerConnectorToken({ service: 'SLACK' }) по коду не трогать.

export async function getOwnerConnectorToken(
  body: { service: string; genericOauthService?: string; configConnector?: string },
): Promise<string> {
  if (body.service === 'SLACK') {
    const token = process.env.SLACK_USER_TOKEN;
    if (!token) {
      throw new Error('SLACK_USER_TOKEN is not set. Добавьте user-токен (xoxp-...) в .env.');
    }
    return token;
  }
  throw new Error(`Unknown connector service: ${body.service}`);
}
