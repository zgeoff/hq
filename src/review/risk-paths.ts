// The owner's must-fix-before-merge list: auth, secrets or credentials, money,
// migrations, deletion, infra permissions. A changed path or a changed line that names one is risky.
export const RISK_PATHS: [RegExp, string][] = [
  [/auth|oauth|login|passw|credential|secret|token|\.env\b|keys?\//i, 'auth or secrets'],
  [/billing|payment|stripe|invoice|refund|pric(e|ing)|wallet/i, 'money'],
  [/migrat|schema|\.sql$|(^|\/)db\.ts$/i, 'migrations'],
  [/(^|\/)\.github\/workflows\/|terraform|\.tf$|iam|rbac|permission|grant|polic(y|ies)|infra|deploy|systemd|\.service$|sudoers/i, 'infra permissions'],
];
