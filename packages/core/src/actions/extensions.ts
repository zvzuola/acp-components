import type { AcpClient } from '../client/AcpClient';

export async function callExtMethod(
  client: AcpClient,
  method: string,
  params: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  return client.extMethod(method, params);
}

export async function sendExtNotification(
  client: AcpClient,
  method: string,
  params: Record<string, unknown>,
): Promise<void> {
  return client.extNotification(method, params);
}
