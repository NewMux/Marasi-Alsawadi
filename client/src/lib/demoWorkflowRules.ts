export function firstMissingDemoField(fields: Array<[label: string, value: string]>) {
  const missing = fields.find(([, value]) => !value.trim());
  return missing ? `${missing[0]} is required.` : null;
}
