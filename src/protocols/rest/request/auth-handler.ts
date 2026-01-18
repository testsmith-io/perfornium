import { AxiosRequestConfig } from 'axios';

export class AuthHandler {
  static handleAuthentication(
    config: AxiosRequestConfig,
    headers: Record<string, string>,
    auth: any
  ): void {
    switch (auth.type) {
      case 'basic':
        if (auth.username && auth.password) {
          config.auth = { username: auth.username, password: auth.password };
        }
        break;
      case 'bearer':
        if (auth.token) {
          headers['Authorization'] = `Bearer ${auth.token}`;
        }
        break;
      case 'digest':
        if (auth.username && auth.password) {
          config.auth = { username: auth.username, password: auth.password };
        }
        break;
      case 'oauth':
        if (auth.token) {
          headers['Authorization'] = `OAuth ${auth.token}`;
        }
        break;
    }
  }
}
