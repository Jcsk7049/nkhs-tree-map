export function isAllowedDomain(email, allowedDomain) {
  if (typeof email !== 'string' || !email.includes('@')) {
    return false;
  }
  const parts = email.split('@');
  if (parts.length !== 2 || parts[1].length === 0) {
    return false;
  }
  return parts[1].toLowerCase() === allowedDomain.toLowerCase();
}
