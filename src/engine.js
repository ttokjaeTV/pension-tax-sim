/* ===== 연금인출 세금 엔진 (2026년 세법 기준) ===== */
/* 주의: 은퇴 5년 전 점검 가이드(ttokjaeTV/retire-check)가 이 파일(src/engine.js)을 직접 불러 4단계 세금을 계산합니다.
   simulate · retirementTax 함수 이름과 입력·출력 형식을 바꾸면 가이드도 같이 확인하세요. */
const RULE = {
  LOCAL: 1.1,                 // 지방소득세 10% 가산
  SEP_LIMIT: 15000000,        // 사적연금 저율 분리과세 기준 (연)
  SEP_RATE: 0.15,             // 1,500만원 초과 시 선택 분리과세 (국세)
  OTHER_RATE: 0.15,           // 연금외수령 기타소득세 (국세)
  BASIC_DEDUCTION: 1500000,   // 본인 기본공제
  STD_CREDIT: 70000,          // 표준세액공제 (근로소득 없는 종합소득자, 소득세법 59조의4⑨2호나목)
};

// 연금소득세율 (국세) - 확정기간형, 수령 시점 나이
function pensionRate(age) {
  if (age >= 80) return 0.03;
  if (age >= 70) return 0.04;
  return 0.05;
}

// 이연퇴직소득 연금수령 시 퇴직소득세 납부 비율 (실제 수령연차)
function retireFactor(n) {
  if (n <= 10) return 0.7;
  if (n <= 20) return 0.6;
  return 0.5;
}

// 종합소득세 기본세율 (국세)
function progressiveTax(base) {
  if (base <= 0) return 0;
  const B = [
    [14e6, 0.06, 0], [50e6, 0.15, 1.26e6], [88e6, 0.24, 5.76e6],
    [150e6, 0.35, 15.44e6], [300e6, 0.38, 19.94e6], [500e6, 0.40, 25.94e6],
    [1e9, 0.42, 35.94e6], [Infinity, 0.45, 65.94e6],
  ];
  for (const [lim, r, d] of B) if (base <= lim) return base * r - d;
  return 0;
}

// 연금소득공제 (한도 900만원)
function pensionDeduction(total) {
  let d;
  if (total <= 3.5e6) d = total;
  else if (total <= 7e6) d = 3.5e6 + (total - 3.5e6) * 0.4;
  else if (total <= 14e6) d = 4.9e6 + (total - 7e6) * 0.2;
  else d = 6.3e6 + (total - 14e6) * 0.1;
  return Math.min(d, 9e6);
}

// 종합소득세 (지방세 포함) - 연금소득 + 기타 종합소득금액
// 산출세액 − 표준세액공제 7만원(0원 미만 없음) → 지방소득세 10% 가산
function comprehensiveTax(publicPension, privatePension, otherIncome) {
  const total = publicPension + privatePension;
  const income = total - pensionDeduction(total) + otherIncome;
  const base = Math.max(0, income - RULE.BASIC_DEDUCTION);
  return Math.max(0, progressiveTax(base) - RULE.STD_CREDIT) * RULE.LOCAL;
}

// 퇴직소득세 (국세) 간이 계산 - 근속연수공제·환산급여공제 (2023년 이후)
function retirementTax(severance, years) {
  years = Math.max(1, Math.ceil(years));
  let sd;
  if (years <= 5) sd = 1e6 * years;
  else if (years <= 10) sd = 5e6 + 2e6 * (years - 5);
  else if (years <= 20) sd = 15e6 + 2.5e6 * (years - 10);
  else sd = 40e6 + 3e6 * (years - 20);
  const conv = Math.max(0, severance - sd) * 12 / years;
  let cd;
  if (conv <= 8e6) cd = conv;
  else if (conv <= 70e6) cd = 8e6 + (conv - 8e6) * 0.6;
  else if (conv <= 100e6) cd = 45.2e6 + (conv - 70e6) * 0.55;
  else if (conv <= 300e6) cd = 61.7e6 + (conv - 100e6) * 0.45;
  else cd = 151.7e6 + (conv - 300e6) * 0.35;
  const base = Math.max(0, conv - cd);
  return Math.max(0, progressiveTax(base) * years / 12);
}

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
   b1, b2, retTaxNat, b3,      // ① 과세제외 ② 이연퇴직소득(+퇴직소득세 국세) ③ 세액공제분+수익
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
      n: 1, age: p.startAge, limitYear: null, startBal: total0, limit: 0,
      w: total0, from1: b1, from2: b2, from3: b3, over: total0,
      taxRetire: tRet, taxPension: 0, taxOther: tOth, tax, net: total0 - tax,
      method: '전액 연금외수령', p3: 0, endBal: 0, pen2: 0, over2: b2, over3: b3,
    });
    Object.assign(sum, {
      withdrawn: total0, tax, net: total0 - tax, taxRetire: tRet, taxOther: tOth,
      from1: b1, from2: b2, from3: b3, over2: b2, over3: b3, overYears: 1, overAmount: total0,
    });
    sum.effRate = total0 > 0 ? tax / total0 : 0;
    sum.years = 1;
    return { rows, sum };
  }

  const baseYear = p.pre2013 ? 6 : 1;
  const plannedYears = p.mode === 'years' ? Math.max(1, Math.round(p.years)) : null;
  const fixedPay = p.mode === 'years' ? levelPayment(total0, r, plannedYears) : p.amount;
  const MAX_YEARS = 60;
  const MAX_AGE = p.maxAge || 100;

  for (let i = 0; i < MAX_YEARS; i++) {
    const startBal = b1 + b2 + b3;
    if (startBal < 1) break;
    const age = p.startAge + i;
    const n = i + 1;                                   // 실제 수령연차 (매년 인출 가정)
    const limitYear = baseYear + Math.max(0, age - p.eligAge); // 한도 계산용 연차
    const limit = limitYear >= 11 ? Infinity : startBal / (11 - limitYear) * 1.2;

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
      // 계좌 나눠 쓰기: ③(세액공제분 계좌)에서 매년 capAmount까지 꽉 채우고,
      // 부족분은 ①(공제 안 받은 돈) → ②(퇴직금) 계좌에서 보충. ①②는 1,500만원 계산에서 빠짐.
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
    const tRet = pen.b2 * retRate * retireFactor(n) * RULE.LOCAL + out.b2 * retRate * RULE.LOCAL;
    const p3 = pen.b3; // 1,500만원 판정 대상 (세액공제분+수익의 연금수령분)
    let tPen = 0, method = '-';
    let lowFlag = false, highFlag = false;
    if (p3 > 0) {
      // 종합과세 시 ③ 때문에 늘어나는 세금 = (공적+③) − (공적만), 표준세액공제 반영
      const pub = (p.publicStartAge == null || age >= p.publicStartAge) ? (p.publicPension || 0) : 0;
      const comp = comprehensiveTax(pub, p3, p.otherIncome || 0)
                 - comprehensiveTax(pub, 0, p.otherIncome || 0);
      if (p3 <= RULE.SEP_LIMIT) {
        // 1,500만원 이하: 저율 분리과세(3.3~5.5%)가 기본, 종합과세 합산도 선택 가능 (소득세법 14조③9호 괄호)
        const low = p3 * pensionRate(age) * RULE.LOCAL;
        lowFlag = true;
        if (comp < low) { tPen = comp; method = '종합과세 선택'; sum.lowCompYears++; }
        else { tPen = low; method = '저율 ' + (pensionRate(age) * 110).toFixed(1) + '%'; }
      } else {
        // 1,500만원 초과: 전액 종합과세 vs 16.5% 분리과세 중 선택 (소득세법 64조의4)
        const sep = p3 * RULE.SEP_RATE * RULE.LOCAL;
        highFlag = true;
        if (comp < sep) { tPen = comp; method = '종합과세 선택'; sum.compYears++; }
        else { tPen = sep; method = '분리과세 16.5%'; sum.sepYears++; }
      }
    }
    const tOth = out.b3 * RULE.OTHER_RATE * RULE.LOCAL;
    const tax = tRet + tPen + tOth;
    const over = out.b1 + out.b2 + out.b3;

    // 남은 돈 운용 (운용수익은 ③ 바구니로)
    const remainBal = b1 + b2 + b3;
    b3 += remainBal * r;

    rows.push({
      n, age, limitYear, startBal, limit, w,
      from1: take.b1, from2: take.b2, from3: take.b3, over,
      taxRetire: tRet, taxPension: tPen, taxOther: tOth, tax, net: w - tax,
      method, p3, endBal: b1 + b2 + b3,
      pen2: pen.b2, over2: out.b2, over3: out.b3,
    });

    sum.withdrawn += w; sum.tax += tax; sum.net += w - tax;
    sum.taxRetire += tRet; sum.taxOther += tOth;
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

if (typeof module !== 'undefined') module.exports = {
  RULE, pensionRate, retireFactor, progressiveTax, pensionDeduction,
  comprehensiveTax, retirementTax, levelPayment, simulate,
};
