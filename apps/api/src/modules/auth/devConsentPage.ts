function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

interface ConsentPageInput {
  state: string;
  csrf: string;
  error?: string;
  values?: { email: string; firstName: string; lastName: string };
}

/**
 * The development stand-in for Google's account chooser. Served by the API only when no
 * Google credentials are configured, which production boot forbids.
 */
export function renderDevConsentPage(input: ConsentPageInput): string {
  const values = input.values ?? { email: '', firstName: '', lastName: '' };
  const error = input.error
    ? `<p class="error" role="alert" id="form-error">${escapeHtml(input.error)}</p>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Development Google sign-in · Kinfolk</title>
<style>
  body { font: 16px/1.5 system-ui, sans-serif; background: #f6f2ea; color: #1f2a2e; margin: 0; padding: 2rem 1rem; }
  main { max-width: 26rem; margin: 0 auto; background: #fffdf9; border: 1px solid #d6cdbd; border-radius: 12px; padding: 1.5rem; }
  h1 { font-size: 1.25rem; margin: 0 0 .5rem; }
  p { margin: 0 0 1rem; color: #4a5558; }
  label { display: block; font-weight: 600; margin: 1rem 0 .25rem; }
  input { box-sizing: border-box; width: 100%; min-height: 44px; font: inherit; padding: .5rem .75rem; border: 1px solid #8a8577; border-radius: 8px; }
  button { margin-top: 1.5rem; min-height: 44px; width: 100%; font: inherit; font-weight: 600; color: #fff; background: #1f5c52; border: 0; border-radius: 8px; }
  .error { color: #9b2c24; font-weight: 600; }
</style>
</head>
<body>
<main>
  <h1>Development Google sign-in</h1>
  <p>No Google credentials are configured, so this form stands in for Google. It signs you in through the same session code as the real Google callback.</p>
  ${error}
  <form method="post" action="/api/auth/oauth/dev/authorize">
    <input type="hidden" name="state" value="${escapeHtml(input.state)}">
    <input type="hidden" name="_csrf" value="${escapeHtml(input.csrf)}">
    <label for="email">Google account email</label>
    <input id="email" name="email" type="email" autocomplete="email" required value="${escapeHtml(values.email)}">
    <label for="firstName">First name</label>
    <input id="firstName" name="firstName" autocomplete="given-name" required value="${escapeHtml(values.firstName)}">
    <label for="lastName">Last name</label>
    <input id="lastName" name="lastName" autocomplete="family-name" value="${escapeHtml(values.lastName)}">
    <button type="submit">Continue</button>
  </form>
</main>
</body>
</html>`;
}
