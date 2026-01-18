export class BodyProcessor {
  static processBodyPayload(body: any): { data: any; contentType?: string } {
    if (typeof body === 'string') {
      const trimmedBody = body.trim();

      if (BodyProcessor.isJsonString(trimmedBody)) {
        return { data: body, contentType: 'application/json' };
      }

      if (BodyProcessor.isXmlString(trimmedBody)) {
        return { data: body, contentType: 'application/xml' };
      }

      if (BodyProcessor.isTemplateString(body)) {
        const detectedType = BodyProcessor.detectTemplateContentType(body);
        return { data: body, contentType: detectedType };
      }

      return { data: body, contentType: 'text/plain' };
    } else {
      return { data: JSON.stringify(body), contentType: 'application/json' };
    }
  }

  static isJsonString(str: string): boolean {
    if (!str.startsWith('{') && !str.startsWith('[')) {
      return false;
    }
    try {
      JSON.parse(str);
      return true;
    } catch {
      return false;
    }
  }

  static isXmlString(str: string): boolean {
    return str.startsWith('<?xml') ||
      (str.startsWith('<') && str.includes('>') && str.endsWith('>'));
  }

  static isTemplateString(body: string): boolean {
    return body.includes('{{template:') ||
      (body.includes('{{') && body.includes('}}'));
  }

  static detectTemplateContentType(templateBody: string): string | undefined {
    const templateMatch = templateBody.match(/\{\{template:([^}]+)\}\}/);
    if (templateMatch) {
      const templatePath = templateMatch[1];
      if (templatePath.endsWith('.json')) return 'application/json';
      if (templatePath.endsWith('.xml')) return 'application/xml';
    }
    return undefined;
  }

  static hasContentTypeHeader(headers: Record<string, string>): boolean {
    if (!headers) return false;
    const headerKeys = Object.keys(headers).map(key => key.toLowerCase());
    return headerKeys.includes('content-type');
  }
}
