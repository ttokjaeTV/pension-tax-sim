/* ===== 연금인출 세금 엔진 (2026년 세법 기준) ===== */
/* 제도 숫자(세율·한도·구간표·건보료 요율)는 공용 기준 파일 rules.js의 전역 TTOKJAE_RULES에서 읽고,
   법정 계산(누진세·연금소득공제·종합과세·퇴직소득세·연금세율·감면 비율·공정시장가액·재산 점수·건보료·피부양자)은
   공용 계산 엔진 calc-v1.js(전역 TTOKJAE_CALC)가 한다. 아래 옛 이름 함수(pensionRate·comprehensiveTax·nhRegional …)는 엔진을 부르는
   얇은 껍데기 — 이름·인자·단위·결과(부동소수 끝자리까지)가 전환 전과 같다. simulate(인출 흐름)는 이 파일에 그대로 있다.
   → 이 파일보다 먼저 <script src="https://ttokjaetv.github.io/rules/v2026.2/rules.js"> 와
     <script src="https://ttokjaetv.github.io/rules/calc-v1.js"> 를 불러야 함 (Node 테스트는 global.TTOKJAE_RULES·TTOKJAE_CALC). */
/* 주의: 은퇴 5년 전 점검 가이드(ttokjaeTV/retire-check)가 이 파일(src/engine.js)을 직접 불러 4단계 세금을 계산합니다.
   simulate · retirementTax 함수 이름과 입력·출력 형식을 바꾸면 가이드도 같이 확인하세요.
   가이드 페이지에서는 이 파일의 최상위 이름이 가이드 스크립트 전역과 한 공간에 놓이므로, 새 최상위 이름은 겹치지 않게(TR·C·CALC·PEN 등 금지) 짓는다. */
// 공용 계산 엔진 묶음 — 이 파일이 새로 만드는 최상위 이름은 이것 하나 (retire-check 페이지 전역과 겹치지 않는 이름)
const PTS_CALC = TTOKJAE_CALC.bind(TTOKJAE_RULES);
const RULE = {
  LOCAL: 1 + TTOKJAE_RULES.INCOME_TAX.local,                  // 지방소득세 10% 가산 (1.1)
  SEP_LIMIT: TTOKJAE_RULES.PENSION.separateLimit,             // 사적연금 저율 분리과세 기준 (연 1,500만원)
  SEP_RATE: TTOKJAE_RULES.PENSION.separateRateNational,       // 1,500만원 초과 시 선택 분리과세 (국세 15%)
  OTHER_RATE: TTOKJAE_RULES.PENSION.otherIncomeRateNational,  // 연금외수령 기타소득세 (국세 15%)
  BASIC_DEDUCTION: TTOKJAE_RULES.INCOME_TAX.basicDeduction,   // 본인 기본공제 (150만원)
  ELDER_DEDUCTION: TTOKJAE_RULES.INCOME_TAX.elderDeduction,   // 경로우대공제 (70세 이상 100만원, 소득세법 51조①1호)
  STD_CREDIT: TTOKJAE_RULES.INCOME_TAX.standardTaxCredit,     // 표준세액공제 (7만원, 근로소득 없는 종합소득자, 소득세법 59조의4⑨2호나목)
};

// 연금소득세율 (국세) - 확정기간형, 수령 시점 나이 (rules: [나이 상한(미만), 세율] = [[70, 5%], [80, 4%], [∞, 3%]])
function pensionRate(age) {
  const r = PTS_CALC.pension.rate(age);
  if (r !== undefined) return r;
  // 엔진은 NaN·Infinity 나이에 값이 없음 → 전환 전처럼 NaN은 첫 구간, Infinity는 마지막 구간
  const T = TTOKJAE_RULES.PENSION.rateByAgeNational;
  return age >= T[T.length - 2][0] ? T[T.length - 1][1] : T[0][1];
}

// 이연퇴직소득 연금수령 시 퇴직소득세 납부 비율 (실제 수령연차) — [[10, 0.7], [20, 0.6], [∞, 0.5]]
function retireFactor(n) {
  const r = PTS_CALC.pension.retireRatio(n);
  if (r !== undefined) return r;
  const T = TTOKJAE_RULES.RETIREMENT_INCOME_TAX.pensionPayRatio;   // 엔진은 NaN 연차에 값이 없음 → 전환 전처럼 마지막 구간
  return T[T.length - 1][1];
}

// 종합소득세 기본세율 (국세)
function progressiveTax(base) { return PTS_CALC.incomeTax.basic(base); }

// 연금소득공제 (한도 900만원)
function pensionDeduction(total) { return PTS_CALC.incomeTax.pensionDeduction(total); }

// 종합소득세 (지방세 포함) - 연금소득 + 기타 종합소득금액
// 인적공제: 본인 기본공제 150만 + 70세 이상 경로우대 100만 (1인 기준, 배우자·부양가족 공제 제외)
// 산출세액 − 표준세액공제 7만원(0원 미만 없음) → 지방소득세 10% 가산
function comprehensiveTax(publicPension, privatePension, otherIncome, age) {
  // 엔진은 다른 소득이 없거나 NaN이면 더하지 않고 계산함 → 전환 전 식(… + otherIncome)처럼 과세표준이 NaN이 되어 세액 0
  if (otherIncome === undefined || Number.isNaN(otherIncome)) return 0;
  return PTS_CALC.incomeTax.comprehensive({ pension: [publicPension, privatePension], otherIncome, age }).total;
}

// 퇴직소득세 (국세) 간이 계산 - 근속연수공제·환산급여공제 (2023년 이후)
function retirementTax(severance, years) { return PTS_CALC.retirementTax.calc(severance, years).national; }

// 기간 N년에 균등 소진되는 연 인출액 (연초 인출)
function levelPayment(balance, r, n) {
  if (n <= 0) return balance;
  let s = 0;
  for (let k = 0; k < n; k++) s += Math.pow(1 + r, -k);
  return balance / s;
}

/*
 p = {
   startAge, eligAge, pre2013,
   b1, b2, retTaxNat, b3,      // ① 과세제외 ② 이연퇴직소득(+퇴직소득세 국세) ③ 세액공제 받은 원금+수익
   r,                           // 연 운용수익률
   mode: 'years' | 'amount' | 'lump' | 'cap' | 'split',
   desired,                     // split 모드: 매년 받고 싶은 금액
   phase1Amount, capAmount,     // cap 모드: ①② 구간 연 인출액, ③ 구간 연 상한
   years, amount,
   publicPension, publicStartAge, otherIncome,  // 공적연금은 publicStartAge 이후부터 합산
 }
*/
function simulate(p) {
  const r = p.r;
  const retRate = p.b2 > 0 ? (p.retTaxNat / p.b2) : 0; // 퇴직소득세율 (국세)
  let b1 = p.b1, b2 = p.b2, b3 = p.b3;
  const total0 = b1 + b2 + b3;
  const rows = [];
  const sum = {
    withdrawn: 0, tax: 0, net: 0,
    taxRetire: 0, taxPensionLow: 0, taxPensionHigh: 0, taxOther: 0,
    taxRetireOver: 0,                        // taxRetire 중 한도 초과(연금외수령) 퇴직금에 붙은 몫 (감면 없음)
    from1: 0, from2: 0, from3: 0,
    pen2: 0, over2: 0, pen3: 0, over3: 0,   // 연금수령분(한도 안) vs 연금외수령분(한도 초과)
    overYears: 0, overAmount: 0,
    highYears: 0, compYears: 0, sepYears: 0,
    lowYears: 0, lowCompYears: 0,            // 1,500만원 이하인 해 / 그중 종합과세가 유리해 선택한 해
  };

  // 한 번에 해지 (전액 연금외수령)
  if (p.mode === 'lump') {
    const tRet = b2 * retRate * RULE.LOCAL;
    const tOth = b3 * RULE.OTHER_RATE * RULE.LOCAL;
    const tax = tRet + tOth;
    rows.push({
      n: 1, nRet: 1, age: p.startAge, limitYear: null, startBal: total0, limit: 0,
      w: total0, from1: b1, from2: b2, from3: b3, over: total0,
      taxRetire: tRet, taxPension: 0, taxOther: tOth, tax, net: total0 - tax,
      method: '전액 연금외수령', p3: 0, endBal: 0, pen2: 0, over2: b2, over3: b3,
    });
    Object.assign(sum, {
      withdrawn: total0, tax, net: total0 - tax, taxRetire: tRet, taxRetireOver: tRet, taxOther: tOth,
      from1: b1, from2: b2, from3: b3, over2: b2, over3: b3, overYears: 1, overAmount: total0,
    });
    sum.effRate = total0 > 0 ? tax / total0 : 0;
    sum.years = 1;
    return { rows, sum };
  }

  const PEN = TTOKJAE_RULES.PENSION;
  const baseYear = p.pre2013 ? PEN.pre2013StartYear : 1;
  const plannedYears = p.mode === 'years' ? Math.max(1, Math.round(p.years)) : null;
  const fixedPay = p.mode === 'years' ? levelPayment(total0, r, plannedYears) : p.amount;
  const MAX_YEARS = 60;
  const MAX_AGE = p.maxAge || 100;
  let n2 = 0;   // split 모드: ②(퇴직금 IRP)에서 연금으로 실제로 받은 햇수 (감면 연차)

  for (let i = 0; i < MAX_YEARS; i++) {
    const startBal = b1 + b2 + b3;
    if (startBal < 1) break;
    const age = p.startAge + i;
    const n = i + 1;                                   // 실제 수령연차 (매년 인출 가정)
    const limitYear = baseYear + Math.max(0, age - p.eligAge); // 한도 계산용 연차
    const limit = limitYear >= PEN.payoutLimitFreeYear ? Infinity : startBal / (PEN.payoutLimitFreeYear - limitYear) * PEN.payoutLimitFactor;

    if (p.mode === 'years' && i >= plannedYears) break;
    if (p.mode !== 'years' && age > MAX_AGE) break;     // 금액·맞춤 모드는 100세까지만
    let w, forced = null;
    if (p.mode === 'years') w = (i === plannedYears - 1) ? startBal : Math.min(fixedPay, startBal);
    else if (p.mode === 'cap') {
      // 1,500만원 맞춤: ①② 남아 있는 동안은 phase1Amount, ③에서는 연 capAmount(≤1,500만) 이하
      const cap = Math.min(RULE.SEP_LIMIT, Math.max(0, p.capAmount));
      const avail12 = b1 + b2;
      const take12 = Math.min(avail12, Math.max(0, p.phase1Amount));
      const room3 = avail12 > 0 ? Math.max(0, p.phase1Amount - take12) : cap;
      const take3 = Math.min(b3, cap, room3);
      w = Math.min(take12 + take3, limit);              // 수령한도 안에서만
    }
    else if (p.mode === 'split') {
      // 계좌 나누기: ③(세액공제 받은 원금 계좌)에서 매년 capAmount까지 꽉 채우고,
      // 부족분은 ①(세액공제 받지 않은 원금) → ②(퇴직금) 계좌에서 보충. ①②는 1,500만원 계산에서 빠짐.
      const cap = Math.min(RULE.SEP_LIMIT, Math.max(0, p.capAmount));
      const want = Math.max(100000, p.desired || 0);
      let t3 = Math.min(b3, cap, want);
      let need = want - t3;
      let t1 = Math.min(b1, need); need -= t1;
      let t2 = Math.min(b2, need); need -= t2;
      let cut = t1 + t2 + t3 - limit;                    // 수령한도 넘으면 보충분부터 줄임
      if (cut > 0) { const c2 = Math.min(t2, cut); t2 -= c2; cut -= c2; const c1 = Math.min(t1, cut); t1 -= c1; cut -= c1; t3 -= Math.min(t3, cut); }
      forced = { b1: t1, b2: t2, b3: t3 };
      w = t1 + t2 + t3;
    }
    else w = Math.min(fixedPay, startBal);

    // 인출 순서 ① → ② → ③, 연금수령분이 먼저 인출된 것으로 봄 (split 모드는 계좌별로 나눠 인출)
    let remaining = forced ? 0 : w, used = 0;
    const take = forced ? { ...forced } : { b1: 0, b2: 0, b3: 0 };
    const pen = forced ? { ...forced } : { b1: 0, b2: 0, b3: 0 };   // 연금수령분
    const out = { b1: 0, b2: 0, b3: 0 };   // 연금외수령분
    const pools = forced ? [] : [['b1', b1], ['b2', b2], ['b3', b3]];
    for (const [k, bal] of pools) {
      const t = Math.min(bal, remaining);
      if (t <= 0) continue;
      const inLimit = Math.max(0, Math.min(t, limit - used));
      pen[k] += inLimit;
      out[k] += t - inLimit;
      take[k] += t;
      used += t;
      remaining -= t;
    }
    b1 -= take.b1; b2 -= take.b2; b3 -= take.b3;

    // 세금
    // 퇴직소득세 감면 연차 = 연금 실제 수령연차 (소득세법 제129조①5의2). 한 계좌 모드는 계좌에서 받은 해 = n,
    // split 모드는 ② 계좌가 따로 있으므로 ②를 실제로 받은 해만 센다 (retire-drawdown과 같은 방식)
    if (p.mode === 'split' && pen.b2 > 0.5) n2++;   // 0.5원 미만 소수점 찌꺼기는 받은 해로 안 셈
    const nRet = p.mode === 'split' ? n2 : n;
    const tRetOver = out.b2 * retRate * RULE.LOCAL;   // 한도 초과분은 감면 없이 100%
    const tRet = pen.b2 * retRate * retireFactor(nRet) * RULE.LOCAL + tRetOver;
    const p3 = pen.b3; // 1,500만원 판정 대상 (세액공제 받은 원금+수익의 연금수령분)
    let tPen = 0, method = '-';
    let lowFlag = false, highFlag = false;
    if (p3 > 0) {
      // 종합과세 시 ③ 때문에 늘어나는 세금 = (공적+③) − (공적만), 표준세액공제 반영
      const pub = (p.publicStartAge == null || age >= p.publicStartAge) ? (p.publicPension || 0) : 0;
      const comp = comprehensiveTax(pub, p3, p.otherIncome || 0, age)
                 - comprehensiveTax(pub, 0, p.otherIncome || 0, age);
      if (p3 <= RULE.SEP_LIMIT) {
        // 1,500만원 이하: 저율 분리과세(3.3~5.5%)가 기본, 종합과세 합산도 선택 가능 (소득세법 14조③9호 괄호)
        const low = p3 * pensionRate(age) * RULE.LOCAL;
        lowFlag = true;
        if (comp < low) { tPen = comp; method = '종합과세 선택'; sum.lowCompYears++; }
        else { tPen = low; method = '저율 ' + (pensionRate(age) * RULE.LOCAL * 100).toFixed(1) + '%'; }
      } else {
        // 1,500만원 초과: 전액 종합과세 vs 16.5% 분리과세 중 선택 (소득세법 64조의4)
        const sep = p3 * RULE.SEP_RATE * RULE.LOCAL;
        highFlag = true;
        if (comp < sep) { tPen = comp; method = '종합과세 선택'; sum.compYears++; }
        else { tPen = sep; method = '분리과세 ' + (+(PEN.separateRate * 100).toFixed(10)) + '%'; sum.sepYears++; }
      }
    }
    const tOth = out.b3 * RULE.OTHER_RATE * RULE.LOCAL;
    const tax = tRet + tPen + tOth;
    const over = out.b1 + out.b2 + out.b3;

    // 남은 돈 운용 (운용수익은 ③ 바구니로)
    // 운용손실로 원금에 못 미치면 원금을 인출 순서의 반대(③ → ② → ①)로 차감 (소득세법 시행령 제40조의3 제5항) — 바구니가 음수가 되지 않게
    const remainBal = b1 + b2 + b3;
    const gain = remainBal * r;
    if (gain >= 0) b3 += gain;
    else {
      let loss = -gain;
      const l3 = Math.min(b3, loss); b3 -= l3; loss -= l3;
      const l2 = Math.min(b2, loss); b2 -= l2; loss -= l2;
      b1 -= Math.min(b1, loss);
    }

    rows.push({
      n, nRet, age, limitYear, startBal, limit, w,
      from1: take.b1, from2: take.b2, from3: take.b3, over,
      taxRetire: tRet, taxPension: tPen, taxOther: tOth, tax, net: w - tax,
      method, p3, endBal: b1 + b2 + b3,
      pen2: pen.b2, over2: out.b2, over3: out.b3,
    });

    sum.withdrawn += w; sum.tax += tax; sum.net += w - tax;
    sum.taxRetire += tRet; sum.taxRetireOver += tRetOver; sum.taxOther += tOth;
    if (lowFlag) { sum.taxPensionLow += tPen; sum.lowYears++; }
    if (highFlag) { sum.taxPensionHigh += tPen; sum.highYears++; }
    sum.from1 += take.b1; sum.from2 += take.b2; sum.from3 += take.b3;
    sum.pen2 += pen.b2; sum.over2 += out.b2; sum.pen3 += pen.b3; sum.over3 += out.b3;
    if (over > 0.5) { sum.overYears++; sum.overAmount += over; }
  }
  sum.effRate = sum.withdrawn > 0 ? sum.tax / sum.withdrawn : 0;
  sum.years = rows.length;
  sum.leftover = b1 + b2 + b3;   // 마지막 해 이후 남은 돈
  return { rows, sum };
}

/* ===== 건강보험료(건보료) — 은퇴 후 지역가입자·피부양자 (2026년 기준) =====
   금융소득종합과세·건보료 계산기(ttokjaeTV/fin-income-tax)와 같은 요율·기준.
   재산 등급표: 국민건강보험법 시행령 별표 4 (2024-05-07 개정, 재산 기본공제 1억원)
   주택 재산세 과세표준: 공시가격 × 공정시장가액비율(1주택 특례 3억 이하 43%·6억 이하 44%·초과 45%, 2주택 이상 60%) */
const NH = {
  hi: TTOKJAE_RULES.NHIS.healthRate, ltc: TTOKJAE_RULES.NHIS.ltcRate,          // 건강보험료율 · 장기요양보험료율(소득 대비)
  floorIncomeM: TTOKJAE_RULES.NHIS.floorIncomeMonthly,                          // 지역 소득월액 하한
  floorPrem: TTOKJAE_RULES.NHIS.premiumFloorMonthly,                            // 하한 보험료
  capPremM: TTOKJAE_RULES.NHIS.premiumCapMonthly,                               // 소득 보험료 상한(월)
  perPoint: TTOKJAE_RULES.NHIS.perPoint, propDed: TTOKJAE_RULES.NHIS.propertyDeduction,  // 재산 부과점수당 금액 · 재산 기본공제
  finMin: TTOKJAE_RULES.NHIS.finIncomeThreshold,     // 이자·배당 1인 연 1,000만원 이하면 건보료 소득 제외(넘으면 전액)
  pubRate: TTOKJAE_RULES.NHIS.publicPensionRatio,    // 지역가입자 공적연금 반영 비율
  trunc: TTOKJAE_RULES.NHIS.truncUnit,               // 보험료 10원 미만 버림 (고지서처럼, fin-income-tax·etf-vs-direct와 같은 방식)
  depIncome: TTOKJAE_RULES.NHIS.dependent.income, depBiz: TTOKJAE_RULES.NHIS.dependent.biz,
  depProp1: TTOKJAE_RULES.NHIS.dependent.propLow, depProp2: TTOKJAE_RULES.NHIS.dependent.propHigh,
  depPropIncome: TTOKJAE_RULES.NHIS.dependent.propIncome,
};
// [재산금액 상한(만원), 점수] 1~60등급 (국민건강보험법 시행령 별표 4)
const NH_PROP = TTOKJAE_RULES.NHIS.propertyPointTable;

// 주택 재산세 과세표준 (gongsi: 공시가격 합계, multi: 2주택 이상) — 1주택 [[3억, 43%], [6억, 44%], [∞, 45%]], 2주택 이상 60%
function houseTaxBase(gongsi, multi) { return PTS_CALC.property.houseTaxBase(gongsi, multi); }
// 재산 부과점수: (과세표준 − 1억)을 만원 단위로 NH_PROP 등급표에 대 봄
function propPoints(taxBase) { return PTS_CALC.nhis.propertyPoints(taxBase); }

/* 지역가입자 월 보험료 (세대 합산)
   o = { pub: [공적연금 연액…], fin: [이자·배당 연액…], other: 임대·사업 등 소득금액(연, 세대 합계), taxBase: 주택 과세표준 }
   고지서처럼 10원 미만 버림: 소득 보험료·재산 보험료를 각각 버리고, 장기요양보험료는 버림한 건강보험료 × 장기요양/건강 요율을 다시 버림
   (fin-income-tax·etf-vs-direct의 floor10과 같은 방식). 이자·배당은 1인별로 1,000만원 초과면 전액, 하한 보험료 아래로 내려가지 않음 */
function nhRegional(o) {
  const pub = o.pub || [], fin = o.fin || [];   // 전처럼: 없음·0·NaN이면 빈 목록, 배열이 아니면 TypeError (엔진은 숫자 하나도 받아 줌)
  if (!Array.isArray(pub) || !Array.isArray(fin)) throw new TypeError('nhRegional: pub·fin은 배열');
  const r = PTS_CALC.nhis.regional({ pub, fin, other: o.other, taxBase: o.taxBase });
  return { income: r.income, m: r.m, incPrem: r.incPrem, pts: r.pts, propPrem: r.propPrem, health: r.health, ltc: r.ltc, total: r.total, floor: r.floor };
}

/* 피부양자 요건 (가족 중 직장가입자가 있을 때)
   people = [{ pub, fin, other, taxBase }] — 소득: 공적연금 100% + 금융소득(1,000만원 넘으면 전액) + 기타. 사적연금 제외.
   소득 요건은 부부를 함께(한 명이 넘으면 둘 다 탈락), 재산 요건은 각자 명의 기준
   other(임대·사업 등)는 사업소득으로 보고 별도 요건도 본다: 사업자등록이 있거나 주택임대소득이 있으면 0원이어야, 둘 다 없으면 연 500만원 이하 (시행규칙 별표 1의2: 미등록 500만원 예외에서 주택임대소득은 제외) (fin-income-tax·etf-vs-direct와 같은 규칙) */
// → { people: [{ inc, biz, bizReg, tb, bizOk, incOk, propOk, ok }], incAll, ok } (근로소득 wage 등 다른 필드는 전처럼 보지 않음)
function nhDependent(people) {
  return PTS_CALC.nhis.dependent(people.map(p => ({ pub: p.pub, fin: p.fin, other: p.other, bizReg: p.bizReg, taxBase: p.taxBase })));
}

if (typeof module !== 'undefined') module.exports = {
  RULE, pensionRate, retireFactor, progressiveTax, pensionDeduction,
  comprehensiveTax, retirementTax, levelPayment, simulate,
  NH, NH_PROP, houseTaxBase, propPoints, nhRegional, nhDependent,
};
