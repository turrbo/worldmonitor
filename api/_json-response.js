function sanitizeJsonValue(value) {
  if (value instanceof Error) {
    return { error: value.message };
  }

  if (Array.isArray(value)) {
    return value.map(sanitizeJsonValue);
  }

  if (value && typeof value === 'object') {
    const clone = {};
    for (const [key, nested] of Object.entries(value)) {
      if (key === 'stack' || key === 'stackTrace') continue;
      clone[key] = sanitizeJsonValue(nested);
    }
    return clone;
  }

  return value;
}

export function jsonResponse(body, status, headers = {}) {
  return new Response(JSON.stringify(sanitizeJsonValue(body)), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  });
}
