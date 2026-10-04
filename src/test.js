const E = require('./engine.js');
let fail = 0;
function eq(name, got, exp, tol = 1) {
  const ok = Math.abs(got - exp) <= tol;
  if (!ok) fail++;
  console.log((ok ? 'PASS ' : 'FAIL ') + name + ' got=' + Math.round(got) + ' exp=' + Math.round(exp));
}

// 1) 퇴직소득세: 3억, 30년 → 손계산 9,862,500
eq('퇴직소득세 3억/30년', E.retirementTax(3e8, 30), 9862500);
// 2) 연금소득공제
eq('연금소득공제 1,000만', E.pensionDeduction(1e7), 4.9e6 + 3e6 * 0.2);
eq('연금소득공제 한도', E.pensionDeduction(1e8), 9e6);
// 3) 누진세
eq('과표 3,470만 세액', E.progressiveTax(34.7e6), 34.7e6 * 0.15 - 1.26e6);

// 4) 미래에셋 예시: 57세, 기산 55, 3년차 한도 = 1.6억/(11-3)*1.2 = 2,400만
let res = E.simulate({ startAge: 57, eligAge: 55, pre2013: false, b1: 0, b2: 1.2e8, retTaxNat: 0, b3: 0.4e8,
  r: 0, mode: 'amount', amount: 2.5e7, publicPension: 0, otherIncome: 0 });
eq('미래에셋 3년차 한도', res.rows[0].limit, 2.4e7);
eq('미래에셋 한도초과 100만', res.rows[0].over, 1e6);

// 5) 동아 예시: 58세 신규 IRP 3억, 1년차 한도 3,600만; 퇴직세율 10% → 10년차까지 7%(국세)
res = E.simulate({ startAge: 58, eligAge: 58, pre2013: false, b1: 0, b2: 3e8, retTaxNat: 3e7, b3: 0,
  r: 0, mode: 'amount', amount: 3e7, publicPension: 0, otherIncome: 0 });
eq('동아 1년차 한도', res.rows[0].limit, 3.6e7);
eq('동아 1년차 퇴직세 (3천만×7%×1.1)', res.rows[0].taxRetire, 3e7 * 0.07 * 1.1);
// 10년 동안 3천만씩 → 전액 소진, 모두 7%
eq('동아 10년 총세금', res.sum.tax, 3e8 * 0.07 * 1.1);
eq('동아 연차수', res.sum.years, 10, 0);

// 6) 21년차 이후 50%: 1억, 연 400만 → 25년, 1~10:7%,11~20:6%,21~25:5% (세율10%)
res = E.simulate({ startAge: 55, eligAge: 55, pre2013: false, b1: 0, b2: 1e8, retTaxNat: 1e7, b3: 0,
  r: 0, mode: 'amount', amount: 4e6, publicPension: 0, otherIncome: 0 });
eq('3단계 감면 총세금', res.sum.tax, (4e7 * 0.07 + 4e7 * 0.06 + 2e7 * 0.05) * 1.1);

// 7) 인출순서: ① 과세제외 먼저
res = E.simulate({ startAge: 60, eligAge: 55, pre2013: false, b1: 5e6, b2: 0, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'amount', amount: 1e7, publicPension: 0, otherIncome: 0 });
eq('순서 ①먼저 from1', res.rows[0].from1, 5e6);
eq('순서 ③ 500만 5.5%', res.rows[0].taxPension, 5e6 * 0.055);

// 8) 1,500만 초과: 공적연금 0, 2,000만 → 종합과세 vs 16.5%
res = E.simulate({ startAge: 65, eligAge: 55, pre2013: false, b1: 0, b2: 0, retTaxNat: 0, b3: 2e7,
  r: 0, mode: 'amount', amount: 2e7, publicPension: 0, otherIncome: 0 });
const ded = E.pensionDeduction(2e7); // 630+60=690만
const comp = E.progressiveTax(2e7 - ded - 1.5e6) * 1.1;
console.log('  1,500초과 종합', Math.round(comp), '분리', 2e7 * 0.165, '선택', res.rows[0].method);
eq('1,500초과 min 선택', res.rows[0].taxPension, Math.min(comp, 2e7 * 0.165));

// 9) 2013 이전 가입 → 6년차부터 → 60세 시작(기산55)이면 11년차 → 한도 없음
res = E.simulate({ startAge: 60, eligAge: 55, pre2013: true, b1: 0, b2: 0, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'amount', amount: 1e8, publicPension: 0, otherIncome: 0 });
console.log('  2013이전 한도연차', res.rows[0].limitYear, '한도', res.rows[0].limit);

// 10) 기간 모드 균등 소진, r=4%, 20년
res = E.simulate({ startAge: 60, eligAge: 55, pre2013: false, b1: 3e7, b2: 2e8, retTaxNat: E.retirementTax(2e8, 25), b3: 1.5e8,
  r: 0.04, mode: 'years', years: 20, publicPension: 0, otherIncome: 0 });
console.log('  20년 rows', res.rows.length, '마지막 잔액', Math.round(res.rows.at(-1).endBal), '첫해 인출', Math.round(res.rows[0].w), '마지막해 인출', Math.round(res.rows.at(-1).w));
console.log('  총세금', Math.round(res.sum.tax), '실효', (res.sum.effRate * 100).toFixed(2) + '%', '초과연', res.sum.overYears, '1500초과연', res.sum.highYears);
const lump = E.simulate({ startAge: 60, eligAge: 55, pre2013: false, b1: 3e7, b2: 2e8, retTaxNat: E.retirementTax(2e8, 25), b3: 1.5e8,
  r: 0.04, mode: 'lump', publicPension: 0, otherIncome: 0 });
console.log('  해지 총세금', Math.round(lump.sum.tax), '실효', (lump.sum.effRate * 100).toFixed(2) + '%');
console.log('  퇴직세 2억/25년', Math.round(E.retirementTax(2e8, 25)));
// 11) 공적연금 개시 나이: 64세 전에는 합산 안 함
res = E.simulate({ startAge: 60, eligAge: 55, pre2013: false, b1: 0, b2: 0, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'amount', amount: 2e7, publicPension: 1.44e7, publicStartAge: 64, otherIncome: 0 });
const c0 = E.comprehensiveTax(0, 2e7, 0), c1 = E.comprehensiveTax(1.44e7, 2e7, 0) - E.comprehensiveTax(1.44e7, 0, 0);
eq('60세 공적연금 미합산', res.rows[0].taxPension, Math.min(c0, 2e7 * 0.165));
eq('64세 공적연금 합산', res.rows[4].taxPension, Math.min(c1, 2e7 * 0.165));
// 12) 1,500 맞춤: r=0, ① 0, ② 1억(세율 0), ③ 1억, phase1 2,500, cap 1,500
res = E.simulate({ startAge: 60, eligAge: 50, pre2013: false, b1: 0, b2: 1e8, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'cap', phase1Amount: 2.5e7, capAmount: 1.5e7, publicPension: 0, otherIncome: 0 });
// 1~4년차: ② 2,500씩 = 1억 → 4년. 5년차부터 ③ 1,500씩 → 6.67년
eq('맞춤 1년차 ②', res.rows[0].from2, 2.5e7);
eq('맞춤 5년차 ③', res.rows[4].from3, 1.5e7);
eq('맞춤 ③ 최대값 ≤1500', Math.max(...res.rows.map(r => r.p3)), 1.5e7);
eq('맞춤 1500초과 없음', res.sum.highYears, 0, 0);
eq('맞춤 기간', res.sum.years, 4 + 7, 0);
// 전환 연도: ② 잔액 1,000만 + ③ 1,500
res = E.simulate({ startAge: 60, eligAge: 50, pre2013: false, b1: 0, b2: 6e7, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'cap', phase1Amount: 2.5e7, capAmount: 1.5e7, publicPension: 0, otherIncome: 0 });
eq('전환연도 ②', res.rows[2].from2, 1e7);
eq('전환연도 ③', res.rows[2].from3, 1.5e7);
// 수령한도 준수: 기산 60, 1년차 한도 = 2억/10*1.2 = 2,400 < phase1 2,500
res = E.simulate({ startAge: 60, eligAge: 60, pre2013: false, b1: 0, b2: 1e8, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'cap', phase1Amount: 2.5e7, capAmount: 1.5e7, publicPension: 0, otherIncome: 0 });
eq('맞춤 한도 준수', res.rows[0].w, 2.4e7);
eq('맞춤 한도초과 없음', res.sum.overYears, 0, 0);
// 100세 상한 + 잔액
res = E.simulate({ startAge: 60, eligAge: 55, pre2013: false, b1: 0, b2: 0, retTaxNat: 0, b3: 5e8,
  r: 0.04, mode: 'cap', phase1Amount: 1.5e7, capAmount: 1.5e7, publicPension: 0, otherIncome: 0 });
console.log('  100세 상한 마지막 나이', res.rows.at(-1).age, '잔액', Math.round(res.sum.leftover));
// 13) 나눠 쓰기: r=0, ① 3,000 ② 6,000 ③ 1억, 희망 2,500, cap 1,500
res = E.simulate({ startAge: 60, eligAge: 50, pre2013: false, b1: 3e7, b2: 6e7, retTaxNat: 0, b3: 1e8,
  r: 0, mode: 'split', desired: 2.5e7, capAmount: 1.5e7, publicPension: 0, otherIncome: 0 });
eq('split 1년차 ③', res.rows[0].from3, 1.5e7);
eq('split 1년차 ①', res.rows[0].from1, 1e7);
eq('split 4년차 ② (①소진 후)', res.rows[3].from2, 1e7);
eq('split 희망액 유지 7년', res.rows.filter(r => r.w >= 2.5e7 - 1).length, 7, 0);
eq('split 1500초과 없음', res.sum.highYears, 0, 0);
eq('split 총인출', res.sum.withdrawn, 1.9e8);
console.log(fail ? `\n${fail} FAIL` : '\nALL PASS');
