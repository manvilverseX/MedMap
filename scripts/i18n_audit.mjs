#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import ts from 'typescript';

const ALLOWLIST_WORDS = new Set([
  'medmap',
  'abha',
  'abdm',
  'ai',
  'ayush',
  'otp',
  'id',
  'pdf',
  'png',
  'jpg',
  'jpeg',
  'webp',
  'kb',
  'mb',
  'gb',
  'b',
  's',
]);

function isAllowedWord(word) {
  const clean = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!clean) return true;
  if (/^\d+$/.test(clean)) return true;
  if (ALLOWLIST_WORDS.has(clean)) return true;
  return false;
}

function hasDisallowedLatin(text) {
  if (!text || typeof text !== 'string') return false;
  // Strip template placeholders like {{seconds}}, {{count}}, {{time}}
  const cleanText = text.replace(/\{\{[\w.]+\}\}/g, ' ');
  // Match words of 2 or more letters
  const words = cleanText.match(/[A-Za-z]{2,}/g) || [];
  for (const w of words) {
    if (!isAllowedWord(w)) {
      return true;
    }
  }
  return false;
}

// 1. Audit src/i18n/strings.ts
function auditDictionary(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true);

  let enStrings = {};
  let hiStrings = {};
  let knStrings = {};

  function parseObjectLiteral(node) {
    const obj = {};
    for (const prop of node.properties) {
      if (ts.isPropertyAssignment(prop)) {
        const key = prop.name.text || prop.name.escapedText || prop.name.getText(sourceFile);
        if (ts.isStringLiteral(prop.initializer) || ts.isNoSubstitutionTemplateLiteral(prop.initializer)) {
          obj[key] = prop.initializer.text;
        }
      }
    }
    return obj;
  }

  function unwrapExpr(expr) {
    if (!expr) return null;
    if (ts.isAsExpression(expr) || ts.isTypeAssertionExpression(expr)) {
      return unwrapExpr(expr.expression);
    }
    return expr;
  }

  ts.forEachChild(sourceFile, (node) => {
    if (ts.isVariableStatement(node)) {
      for (const decl of node.declarationList.declarations) {
        const name = decl.name.getText(sourceFile);
        const expr = unwrapExpr(decl.initializer);
        if (expr && ts.isObjectLiteralExpression(expr)) {
          if (name === 'EN_STRINGS') {
            enStrings = parseObjectLiteral(expr);
          } else if (name === 'HI_STRINGS') {
            hiStrings = parseObjectLiteral(expr);
          } else if (name === 'KN_STRINGS') {
            knStrings = parseObjectLiteral(expr);
          }
        }
      }
    }
  });

  const missingHi = [];
  const missingKn = [];
  const identicalHi = [];
  const identicalKn = [];
  const latinHi = [];
  const latinKn = [];

  for (const [key, enVal] of Object.entries(enStrings)) {
    if (!(key in hiStrings)) {
      missingHi.push({ key, enVal });
    } else {
      const hiVal = hiStrings[key];
      if (hiVal.trim() === enVal.trim()) {
        identicalHi.push({ key, val: hiVal });
      } else if (hasDisallowedLatin(hiVal)) {
        latinHi.push({ key, val: hiVal });
      }
    }

    if (!(key in knStrings)) {
      missingKn.push({ key, enVal });
    } else {
      const knVal = knStrings[key];
      if (knVal.trim() === enVal.trim()) {
        identicalKn.push({ key, val: knVal });
      } else if (hasDisallowedLatin(knVal)) {
        latinKn.push({ key, val: knVal });
      }
    }
  }

  return {
    totalEnKeys: Object.keys(enStrings).length,
    missingHi,
    missingKn,
    identicalHi,
    identicalKn,
    latinHi,
    latinKn,
  };
}

// 2. Audit Patient Frontend Files
const PATIENT_FILES = [
  'src/pages/LandingPage.tsx',
  'src/pages/NotFoundPage.tsx',
  'src/pages/patient/PatientOnboardingPage.tsx',
  'src/pages/patient/PatientIntakePage.tsx',
  'src/pages/patient/PatientDocumentsPage.tsx',
  'src/pages/patient/PatientVerificationPage.tsx',
  'src/components/patient/InactivityCountdownBanner.tsx',
  'src/components/Button.tsx',
  'src/components/Badge.tsx',
  'src/components/ErrorMessage.tsx',
  'src/components/LoadingIndicator.tsx',
  'src/components/StatusBadge.tsx',
  'src/components/EmptyState.tsx',
];

const UI_ATTRIBUTES = new Set([
  'placeholder',
  'title',
  'aria-label',
  'alt',
  'label',
  'aria-description',
  'aria-placeholder',
  'aria-roledescription',
  'text',
]);

function auditFrontendFile(filePath) {
  if (!fs.existsSync(filePath)) return null;
  const content = fs.readFileSync(filePath, 'utf-8');
  const sourceFile = ts.createSourceFile(filePath, content, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);

  const rawJsxText = [];
  const rawAttributes = [];
  const hardcodedCalls = []; // alert, confirm, prompt, toast, setError, setMessage, etc.
  const dynamicConcat = [];
  const fallbacksWithEnglish = [];

  function getLine(pos) {
    const { line } = sourceFile.getLineAndCharacterOfPosition(pos);
    return line + 1;
  }

  function isWrappedInT(node) {
    let curr = node.parent;
    while (curr) {
      if (ts.isCallExpression(curr)) {
        const fnName = curr.expression.getText(sourceFile);
        if (fnName === 't' || fnName.endsWith('.t')) return true;
      }
      curr = curr.parent;
    }
    return false;
  }

  function visit(node) {
    // Check JSX Text
    if (ts.isJsxText(node)) {
      const text = node.getText(sourceFile).trim();
      if (text && hasDisallowedLatin(text)) {
        rawJsxText.push({ line: getLine(node.getStart(sourceFile)), text });
      }
    }

    // Check JSX Attributes like placeholder="...", title="...", aria-label="..."
    if (ts.isJsxAttribute(node)) {
      const attrName = node.name.getText(sourceFile);
      const isUiTextAttr = UI_ATTRIBUTES.has(attrName) || ['aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription'].includes(attrName);
      if (isUiTextAttr) {
        if (node.initializer) {
          if (ts.isStringLiteral(node.initializer)) {
            const val = node.initializer.text.trim();
            if (val && hasDisallowedLatin(val)) {
              rawAttributes.push({ line: getLine(node.getStart(sourceFile)), attr: attrName, text: val });
            }
          } else if (ts.isJsxExpression(node.initializer) && node.initializer.expression) {
            const expr = node.initializer.expression;
            if (ts.isStringLiteral(expr) && hasDisallowedLatin(expr.text)) {
              rawAttributes.push({ line: getLine(expr.getStart(sourceFile)), attr: attrName, text: expr.text });
            } else if (ts.isTemplateExpression(expr) && hasDisallowedLatin(expr.getText(sourceFile)) && !isWrappedInT(expr)) {
              rawAttributes.push({ line: getLine(expr.getStart(sourceFile)), attr: attrName, text: expr.getText(sourceFile) });
            }
          }
        }
      }
    }

    // Check alert, confirm, prompt, toast, setError, setMessage, setAbhaError, setUploadError calls
    if (ts.isCallExpression(node)) {
      const callText = node.expression.getText(sourceFile);
      const isTargetCall = /^(window\.)?(alert|confirm|prompt)$|^(toast|toast\.\w+)$|^set(Error|Message|AbhaError|UploadError|ValidationError|QuestionError|ProcessingMessage)$/.test(callText);
      if (isTargetCall && node.arguments.length > 0) {
        const firstArg = node.arguments[0];
        if (ts.isStringLiteral(firstArg) && hasDisallowedLatin(firstArg.text)) {
          hardcodedCalls.push({ line: getLine(firstArg.getStart(sourceFile)), fn: callText, text: firstArg.text });
        } else if (ts.isTemplateExpression(firstArg) && hasDisallowedLatin(firstArg.getText(sourceFile))) {
          hardcodedCalls.push({ line: getLine(firstArg.getStart(sourceFile)), fn: callText, text: firstArg.getText(sourceFile) });
        }
      }

      // Check t('key') || 'English fallback'
      if (ts.isBinaryExpression(node.parent) && node.parent.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
        const right = node.parent.right;
        if (ts.isStringLiteral(right) && hasDisallowedLatin(right.text) && callText === 't') {
          fallbacksWithEnglish.push({ line: getLine(right.getStart(sourceFile)), fallback: right.text });
        }
      }
    }

    // Check dynamic concat or template literals with English words in JSX expressions
    if (ts.isTemplateExpression(node)) {
      // If parent is not a call to t(...) and it's inside JSX or assigned to UI variable
      if (!isWrappedInT(node)) {
        const text = node.getText(sourceFile);
        if (hasDisallowedLatin(text)) {
          // Check if it's within a JSX element or return statement or variable
          let p = node.parent;
          let inJsx = false;
          let isNonUiAttr = false;
          while (p) {
            if (ts.isJsxAttribute(p)) {
              const name = p.name.getText(sourceFile);
              if (!UI_ATTRIBUTES.has(name) && !['aria-label', 'aria-description', 'aria-placeholder', 'aria-roledescription'].includes(name)) {
                isNonUiAttr = true;
                break;
              }
            }
            if (ts.isJsxElement(p) || ts.isJsxFragment(p)) {
              inJsx = true;
              break;
            }
            p = p.parent;
          }
          if (inJsx && !isNonUiAttr && !rawAttributes.some(a => a.line === getLine(node.getStart(sourceFile)))) {
            dynamicConcat.push({ line: getLine(node.getStart(sourceFile)), text });
          }
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  return {
    filePath,
    rawJsxText,
    rawAttributes,
    hardcodedCalls,
    dynamicConcat,
    fallbacksWithEnglish,
    total: rawJsxText.length + rawAttributes.length + hardcodedCalls.length + dynamicConcat.length + fallbacksWithEnglish.length,
  };
}

// 3. Audit API & Backend Errors Reaching Patient
function auditBackendAndApi() {
  const findings = [];

  // Inspect src/utils/api.ts for hardcoded throw new Error('...') or returned error messages
  const apiPath = 'src/utils/api.ts';
  if (fs.existsSync(apiPath)) {
    const content = fs.readFileSync(apiPath, 'utf-8');
    const sourceFile = ts.createSourceFile(apiPath, content, ts.ScriptTarget.Latest, true);

    function visit(node) {
      if (ts.isThrowStatement(node) && node.expression && ts.isNewExpression(node.expression)) {
        const newExpr = node.expression;
        if (newExpr.expression.getText(sourceFile) === 'Error' && newExpr.arguments?.length) {
          const arg = newExpr.arguments[0];
          if (ts.isStringLiteral(arg) && hasDisallowedLatin(arg.text)) {
            const { line } = sourceFile.getLineAndCharacterOfPosition(arg.getStart(sourceFile));
            findings.push({ file: apiPath, line: line + 1, type: 'API Throw Error', text: arg.text });
          }
        }
      }
      ts.forEachChild(node, visit);
    }
    visit(sourceFile);
  }

  // Inspect backend/app/api/v1/cases.py for patient-facing HTTPException or untranslated intake/error fields
  const casesPyPath = 'backend/app/api/v1/cases.py';
  if (fs.existsSync(casesPyPath)) {
    const lines = fs.readFileSync(casesPyPath, 'utf-8').split('\n');
    lines.forEach((line, idx) => {
      if (line.includes('HTTPException(') && (line.includes('detail="') || line.includes("detail='"))) {
        const m = line.match(/detail=["']([^"']+)["']/);
        if (m && hasDisallowedLatin(m[1])) {
          findings.push({ file: casesPyPath, line: idx + 1, type: 'Backend HTTPException', text: m[1] });
        }
      }
    });
  }

  // Inspect backend/app/services/interview_engine/ayush_questions.py
  const ayushPath = 'backend/app/services/interview_engine/ayush_questions.py';
  if (fs.existsSync(ayushPath)) {
    const content = fs.readFileSync(ayushPath, 'utf-8');
    const questionMatches = content.match(/prompt="([^"]+)"/g) || [];
    findings.push({
      file: ayushPath,
      line: 1,
      type: 'AYUSH Questions Untranslated in Engine',
      text: `${questionMatches.length} questions defined only in English`,
    });
  }

  return findings;
}

// Main execution
export function runAudit() {
  const dictResults = auditDictionary('src/i18n/strings.ts');
  const fileResults = PATIENT_FILES.map(auditFrontendFile).filter(Boolean);
  const backendResults = auditBackendAndApi();

  let markdown = `# MedMap i18n Audit Report (Baseline - Before Fixes)
Date: ${new Date().toISOString()}

## Executive Summary
This audit inspects all patient-facing surfaces for English leaks when Kannada (\`kn\`) or Hindi (\`hi\`) is selected:
- **Dictionary (\`src/i18n/strings.ts\`)**: ${dictResults.totalEnKeys} English keys total.
  - Missing in Hindi (\`hi\`): **${dictResults.missingHi.length}** keys
  - Missing in Kannada (\`kn\`): **${dictResults.missingKn.length}** keys
  - Untranslated/Identical copy in Hindi: **${dictResults.identicalHi.length}** keys
  - Untranslated/Identical copy in Kannada: **${dictResults.identicalKn.length}** keys
  - Disallowed Latin in Hindi: **${dictResults.latinHi.length}** keys
  - Disallowed Latin in Kannada: **${dictResults.latinKn.length}** keys
- **Frontend Patient Files**: Total **${fileResults.reduce((acc, f) => acc + f.total, 0)}** leaked UI elements across ${fileResults.length} files.
- **Backend & API Leaks**: Total **${backendResults.length}** error strings/untranslated definitions reaching the patient.

---

## 1. Dictionary Coverage (\`src/i18n/strings.ts\`)

| Metric | Hindi (\`hi\`) | Kannada (\`kn\`) |
| :--- | :--- | :--- |
| Missing Keys | ${dictResults.missingHi.length} | ${dictResults.missingKn.length} |
| Identical to English (Copy Leak) | ${dictResults.identicalHi.length} | ${dictResults.identicalKn.length} |
| Disallowed Latin Letters | ${dictResults.latinHi.length} | ${dictResults.latinKn.length} |

### Missing Keys in Hindi & Kannada
\`\`\`
${dictResults.missingHi.map(m => m.key).join(', ')}
\`\`\`

---

## 2. Frontend Patient-Facing Leaks

| File | Raw JSX Text | Attributes (\`placeholder\`, \`aria-*\`) | Hardcoded Calls (\`alert\`, \`setError\`) | Dynamic / Concat | Fallbacks (\`\|\| '...'\`) | Total Leaks |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
${fileResults.map(f => `| \`${f.filePath}\` | ${f.rawJsxText.length} | ${f.rawAttributes.length} | ${f.hardcodedCalls.length} | ${f.dynamicConcat.length} | ${f.fallbacksWithEnglish.length} | **${f.total}** |`).join('\n')}
| **Total** | **${fileResults.reduce((a, f) => a + f.rawJsxText.length, 0)}** | **${fileResults.reduce((a, f) => a + f.rawAttributes.length, 0)}** | **${fileResults.reduce((a, f) => a + f.hardcodedCalls.length, 0)}** | **${fileResults.reduce((a, f) => a + f.dynamicConcat.length, 0)}** | **${fileResults.reduce((a, f) => a + f.fallbacksWithEnglish.length, 0)}** | **${fileResults.reduce((a, f) => a + f.total, 0)}** |

### Detailed Leaks by File

${fileResults.map(f => `
### \`${f.filePath}\` (${f.total} findings)
${f.rawJsxText.map(x => `- **Line ${x.line}** [JSX Text]: \`"${x.text}"\``).join('\n')}
${f.rawAttributes.map(x => `- **Line ${x.line}** [Attribute ${x.attr}]: \`"${x.text}"\``).join('\n')}
${f.hardcodedCalls.map(x => `- **Line ${x.line}** [Call ${x.fn}]: \`"${x.text}"\``).join('\n')}
${f.dynamicConcat.map(x => `- **Line ${x.line}** [Dynamic String]: \`"${x.text}"\``).join('\n')}
${f.fallbacksWithEnglish.map(x => `- **Line ${x.line}** [English Fallback]: \`"${x.fallback}"\``).join('\n')}
`).join('\n')}

---

## 3. Backend & API Leaks Reaching Patient

| File | Line | Type | Sample Message |
| :--- | :--- | :--- | :--- |
${backendResults.map(b => `| \`${b.file}\` | ${b.line} | ${b.type} | \`${b.text.replace(/\|/g, '\\|')}\` |`).join('\n')}

---
`;

  return { markdown, dictResults, fileResults, backendResults };
}

import { fileURLToPath } from 'url';

// If run directly from CLI
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const { markdown, dictResults, fileResults, backendResults } = runAudit();
  const outputPath = process.argv[2] || 'docs/I18N_AUDIT_REPORT.md';
  fs.writeFileSync(outputPath, markdown, 'utf-8');
  console.log(`Audit report generated at: ${outputPath}`);
  console.log(`Summary:`);
  console.log(`- Dictionary keys: ${dictResults.totalEnKeys} EN, ${dictResults.missingHi.length} missing in HI, ${dictResults.missingKn.length} missing in KN`);
  console.log(`- Frontend patient leaks: ${fileResults.reduce((a, f) => a + f.total, 0)}`);
  console.log(`- Backend & API leaks: ${backendResults.length}`);
}
