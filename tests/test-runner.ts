/**
 * DockProof AI Comprehensive Test Suite Runner.
 * Executes:
 * - Deterministic Rules Engine (10 Seed Scenarios + Critical Safety Rules)
 * - ZXing Barcode & GTIN Check Digit Validation
 * - Row Level Security (RLS) & Immutability Directives
 */

import { runRulesEngineTests } from './rules-engine.test.ts';
import { runBarcodeTests } from './zxing-barcode.test.ts';
import { runSecurityAndRlsTests } from './rls-and-security.test.ts';

function runAll() {
  console.log('================================================================');
  console.log('   DOCKPROOF AI BACKEND VERIFICATION & SAFETY TEST SUITE');
  console.log('================================================================\n');

  let totalPassed = 0;
  let totalFailed = 0;

  // 1. Rules Engine Tests
  console.log('--- 1. DETERMINISTIC RULES ENGINE & SAFETY DIRECTIVES ---');
  const rules = runRulesEngineTests();
  for (const r of rules.results) {
    const symbol = r.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${symbol}] ${r.name}`);
    if (!r.ok) console.log(`         Error: ${r.message}`);
  }
  totalPassed += rules.passed;
  totalFailed += rules.failed;
  console.log(`  Subtotal: ${rules.passed} passed, ${rules.failed} failed\n`);

  // 2. Barcode Tests
  console.log('--- 2. ZXING BARCODE & GTIN CHECK DIGIT INTEGRATION ---');
  const barcodes = runBarcodeTests();
  for (const b of barcodes.results) {
    const symbol = b.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${symbol}] ${b.name}`);
    if (!b.ok) console.log(`         Error: ${b.message}`);
  }
  totalPassed += barcodes.passed;
  totalFailed += barcodes.failed;
  console.log(`  Subtotal: ${barcodes.passed} passed, ${barcodes.failed} failed\n`);

  // 3. Security and RLS Tests
  console.log('--- 3. ROW LEVEL SECURITY & EVIDENCE IMMUTABILITY ---');
  const rls = runSecurityAndRlsTests();
  for (const s of rls.results) {
    const symbol = s.ok ? '✓ PASS' : '✗ FAIL';
    console.log(`  [${symbol}] ${s.name}`);
    if (!s.ok) console.log(`         Error: ${s.message}`);
  }
  totalPassed += rls.passed;
  totalFailed += rls.failed;
  console.log(`  Subtotal: ${rls.passed} passed, ${rls.failed} failed\n`);

  console.log('================================================================');
  console.log(`SUMMARY: ${totalPassed} PASSED, ${totalFailed} FAILED`);
  console.log('================================================================');

  if (totalFailed > 0) {
    process.exit(1);
  }
}

runAll();
