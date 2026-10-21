// What a changed line names, for each class on the must-fix list (risk-paths.ts).
export const RISK_WORDS: [RegExp, string][] = [
  [/\b(auth\w*|authn|authz|login|logout|sign[_-]?in|session[_-]?token|jwt|api[_-]?key|private[_-]?key|secrets?|credentials?|password|bearer|oauth|access[_-]?token|OP_SERVICE_ACCOUNT_TOKEN)\b/i, 'auth or secrets'],
  [/\b(stripe|payment|billing|invoice|refund|charge)\b/i, 'money'],
  [/\b(ALTER TABLE|CREATE TABLE|DROP TABLE|DROP COLUMN|SCHEMA_VERSION|migration)\b/i, 'migrations'],
  [/\bDELETE FROM\b|\bTRUNCATE\b|\brm -rf\b|\brmSync\(|\bunlinkSync\(|\bdeleteMany\b|\bhard[_ -]?delete\b|\bgh (repo|release) delete\b/i, 'deletion'],
  [/\b(chmod|chown|sudo|setcap|iam|rbac|role binding)\b|\bpermissions:/i, 'infra permissions'],
];
