/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect } from 'react';
import { 
  Calculator, 
  ShieldAlert, 
  Lightbulb, 
  Coins, 
  FileText, 
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  ChevronRight,
  UserCircle2,
  Home,
  Briefcase,
  Heart,
  Baby,
  X,
  ArrowLeft,
  Sparkles,
  Wallet,
  CreditCard,
  Building2,
  TrendingDown,
  Building,
  Scale,
  Zap,
  History,
  Search,
  Gavel
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI } from "@google/genai";
import Markdown from 'react-markdown';

// --- Types ---

type Recipient = '성인 자녀' | '미성년 자녀' | '배우자' | '사위/며느리' | '기타';
type AssetType = '현금' | '아파트' | '꼬마빌딩/상가' | '다가구/단독주택' | '비상장주식' | '상장주식';
type SpecialEvent = '혼인' | '출산' | '해당 없음';
type IncomeStatus = '직장인/사업자 (소득 증빙 충분)' | '사회초년생 (소득 적음)' | '무직/학생';

interface FormData {
  recipient: string;
  asset_type: string;
  amount_krw: number;
  special_event: string;
  income_status: string;
  // Real Estate specific
  valuation_method?: '시가' | '공시지가' | '감정평가';
  is_corp_acquisition?: boolean;
  // CIT specific fields
  business_type?: string;
  annual_revenue?: number;
  bookkeeping_method?: string;
  major_expenses?: string[];
  // Corporate specific fields
  net_profit?: number;
  living_expenses?: number;
  temp_payment_amount?: number;
  surplus_cash?: number;
  has_patent?: boolean;
  exit_amount?: number;
  current_salary?: number;
  child_share_ratio?: number;
  purpose?: string;
}

type AppMode = 'gift' | 'cit' | 'corp_convert' | 'temp_payment' | 'surplus_exit';

// --- Constants ---

const DEDUCTIONS: Record<string, number> = {
  '배우자': 600_000_000,
  '성인 자녀': 50_000_000,
  '미성년 자녀': 20_000_000,
  '사위/며느리': 10_000_000,
  '기타': 10_000_000,
};

// --- Helper Functions ---

const formatKRW = (value: number) => {
  if (value === 0) return "0원";
  if (value >= 100_000_000) {
    const eok = Math.floor(value / 100_000_000);
    const man = Math.floor((value % 100_000_000) / 10_000);
    return `${eok}억 ${man > 0 ? man + '만' : ''}원`;
  }
  return `${(value / 10_000).toLocaleString()}만 원`;
};

const calculateGiftTax = (value: number, deduction: number) => {
  const taxBase = Math.max(0, value - deduction);
  let taxRate = 0;
  let progressiveDeduction = 0;

  if (taxBase <= 100_000_000) {
    taxRate = 0.1;
    progressiveDeduction = 0;
  } else if (taxBase <= 500_000_000) {
    taxRate = 0.2;
    progressiveDeduction = 10_000_000;
  } else if (taxBase <= 1_000_000_000) {
    taxRate = 0.3;
    progressiveDeduction = 60_000_000;
  } else if (taxBase <= 3_000_000_000) {
    taxRate = 0.4;
    progressiveDeduction = 160_000_000;
  } else {
    taxRate = 0.5;
    progressiveDeduction = 460_000_000;
  }

  const finalTax = Math.max(0, taxBase * taxRate - progressiveDeduction);
  return { taxBase, taxRate, finalTax };
};

// --- Main Component ---

export default function App() {
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<AppMode>('gift');
  const [formData, setFormData] = useState<FormData>({
    recipient: '성인 자녀',
    asset_type: '현금',
    amount_krw: 180_000_000,
    special_event: '해당 없음',
    income_status: '직장인/사업자 (소득 증빙 충분)',
    major_expenses: []
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [aiReport, setAiReport] = useState<string | null>(null);
  const [isRevealed, setIsRevealed] = useState(false);
  const [showIncomeHelp, setShowIncomeHelp] = useState(false);

  // Reset reveal state when starting new simulation
  useEffect(() => {
    if (step === 0) setIsRevealed(false);
  }, [step]);

  // --- Logic ---

  const taxResult = useMemo(() => {
    let baseDeduction = DEDUCTIONS[formData.recipient] || 0;
    if (formData.special_event !== '해당 없음' && (formData.recipient === '성인 자녀' || formData.recipient === '미성년 자녀')) {
      baseDeduction += 100_000_000;
    }
    return calculateGiftTax(formData.amount_krw, baseDeduction);
  }, [formData]);

  const loanScenario = useMemo(() => {
    const legalInterestRate = 0.046;
    const annualLegalInterest = formData.amount_krw * legalInterestRate;
    // (입력 금액 * 4.6%) - 1,000만 원 = '실제 연간 납부해야 할 최소 이자액'
    const minAnnualInterest = Math.max(0, annualLegalInterest - 10_000_000);
    const monthlyInterest = minAnnualInterest / 12;
    return { annualLegalInterest, minAnnualInterest, monthlyInterest };
  }, [formData.amount_krw]);

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    setStep(6); // Move to result step
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY! });
      
      let prompt = "";
      
      if (mode === 'corp_convert') {
        prompt = `
          너는 대한민국 최고의 '법인 전환 및 기업 지배구조 전문 세무사'야.
          개인사업자의 [매출], [순이익], [생활비] 데이터를 분석하여 법인 전환 최적 타이밍과 영업권 평가 전략을 마크다운으로 출력해.

          [입력 데이터]
          - 연 매출: ${formatKRW(formData.annual_revenue || 0)}
          - 연 순이익: ${formatKRW(formData.net_profit || 0)}
          - 대표 생활비: ${formatKRW(formData.living_expenses || 0)}

          [출력 가이드]
          1. **손익분기점 분석**: 개인사업자 유지 시(종소세+건보료) vs 법인 전환 시(법인세+급여세+배당세)를 비교하여 실질적인 절세액을 계산해줘.
          2. **영업권(Goodwill) 평가 전략**: 법인 전환 시 대표가 개인사업장의 영업권을 법인에 양도하여 '비과세/저세율 현금'을 확보하는 VVIP 전략을 제시해줘.
          3. **지배구조 설계**: 가족 법인 설립을 통한 자산 이전 및 자녀 지분 참여를 통한 부의 대물림 전략을 언급해줘.
          4. **리스크 관리**: 부당행위계산부인 및 영업권 과다 평가에 따른 세무 리스크를 경고해줘.
          5. **할머니/할아버지도 이해할 수 있는 아주 쉬운 용어**를 사용하고, 마크다운 문법과 가로선(---)을 활용해.

          [출력 포맷]
          ## 🚀 법인 전환 최적 타이밍 및 영업권 평가 리포트
          ---
          ### 1. 📊 개인 vs 법인, 세금 비교 진단
          - **현재 상태:** 순이익 ${formatKRW(formData.net_profit || 0)} 기준
          - **진단:** [법인 전환이 유리한지, 아니면 개인사업 유지가 나은지 분석]
          - **절세 예상액:** [연간 약 얼마의 세금을 아낄 수 있는지]

          ---
          ### 2. 💰 '영업권'으로 세금 없이 현금 챙기기 (VVIP 전략)
          - **전략:** 사장님의 노하우와 단골 손님(영업권)을 법인에 팔아서 목돈을 챙기는 방법입니다.
          - **효과:** [비과세 또는 낮은 세율로 현금을 인출하는 효과 설명]
          - **주의:** [세무서에서 의심하지 않도록 적정 가격을 매기는 것이 중요함]

          ---
          ### 3. 👨‍👩‍👧‍👦 가족과 함께하는 법인 운영
          - **추천:** [자녀나 배우자를 주주로 참여시켜 배당을 나누는 전략]
          - **장점:** [나중에 상속세를 줄이는 효과]
        `;
      } else if (mode === 'temp_payment') {
        prompt = `
          너는 법인 대표들의 시한폭탄인 '가지급금 해결 전문 컨설턴트'야.
          [가지급금 잔액], [법인 잉여금], [특허 보유 여부]를 바탕으로 안전한 정산 로드맵을 마크다운으로 출력해.

          [입력 데이터]
          - 가지급금 잔액: ${formatKRW(formData.temp_payment_amount || 0)}
          - 법인 잉여 현금: ${formatKRW(formData.surplus_cash || 0)}
          - 특허/상표권 보유: ${formData.has_patent ? '있음' : '없음'}

          [출력 가이드]
          1. **리스크 경고**: 가지급금 방치 시 발생하는 인정이자(4.6%)와 법인세 가산 리스크를 아주 무섭게(?) 하지만 쉽게 설명해줘.
          2. 해결 시나리오:
             - 급여/배당 인상 (세금 부담 분석)
             - **산업재산권(특허) 자본화**: 대표 명의 특허를 법인에 양도하여 상계하는 전략 (보유 시 구체적 방법, 미보유 시 직무발명보상제도 활용법)
             - **자기주식 취득(이익소각)**: 법인이 대표 주식을 사서 소각하며 가지급금을 끄는 방법
          3. **안전 로드맵**: 가장 세금이 적게 드는 순서대로 해결책을 제시해줘.
          4. 아주 쉬운 용어와 마크다운 문법 사용.

          [출력 포맷]
          ## 🚨 가지급금 안전 정산 및 리스크 진단 리포트
          ---
          ### 1. 💣 방치하면 터지는 시한폭탄, 가지급금
          - **현재 잔액:** ${formatKRW(formData.temp_payment_amount || 0)}
          - **매년 늘어나는 이자:** [약 얼마의 인정이자가 발생하는지]
          - **위험:** [세무조사 타겟이 될 수 있다는 점 강조]

          ---
          ### 2. 🛠️ 세금 아끼며 해결하는 3가지 방법
          - **방법 1 (특허 활용):** ${formData.has_patent ? '보유하신 특허를 활용해 세금 없이 가지급금을 갚을 수 있습니다.' : '지금이라도 직무발명보상제도를 도입해 특허를 만들고 활용해야 합니다.'}
          - **방법 2 (주식 소각):** [법인이 사장님 주식을 사서 없애는 방법 설명]
          - **방법 3 (배당 활용):** [세금을 조금 내더라도 배당으로 털어내는 방법]
        `;
      } else if (mode === 'surplus_exit') {
        prompt = `
          너는 법인의 쌓인 돈을 안전하게 꺼내주는 '이익잉여금 엑시트 전문가'야.
          [인출 목표], [현재 연봉], [가족 지분율]을 분석하여 최적의 인출 믹스를 마크다운으로 출력해.

          [입력 데이터]
          - 인출 목표 금액: ${formatKRW(formData.exit_amount || 0)}
          - 현재 연봉: ${formatKRW(formData.current_salary || 0)}
          - 가족 지분율: ${formData.child_share_ratio || 0}%

          [출력 가이드]
          1. **잉여금의 역습**: 잉여금이 쌓일수록 비상장주식 가치가 올라가 상속세 폭탄이 된다는 점을 경고해줘.
          2. **최적 인출 믹스**:
             - 급여/상여 조정 (소득세 구간 활용)
             - 차등 배당 (가족 지분 활용 시 절세 효과 극대화)
             - 임원 퇴직금 중간정산 또는 퇴직금 적립 전략
          3. **VVIP 전략**: 가족 법인을 설립하여 사업권을 이전하거나, 자녀 지분을 활용한 배당 엑시트 전략을 상세히 제안해줘.
          4. 아주 쉬운 용어와 마크다운 문법 사용.

          [출력 포맷]
          ## 💰 이익잉여금 최적 엑시트(인출) 전략 리포트
          ---
          ### 1. ⚠️ 쌓아두면 독이 되는 잉여금
          - **진단:** [잉여금이 많을 때 나중에 자녀가 낼 상속세가 얼마나 늘어나는지]
          - **목표:** ${formatKRW(formData.exit_amount || 0)} 안전하게 꺼내기

          ---
          ### 2. 📈 세금 최소화 인출 로드맵
          - **전략 1 (가족 배당):** [가족 지분 ${formData.child_share_ratio}%를 활용해 세금을 나누어 내는 방법]
          - **전략 2 (퇴직금 활용):** [나중에 퇴직할 때 낮은 세율로 목돈을 챙기는 법]
          - **전략 3 (연봉 조정):** [현재 연봉 ${formatKRW(formData.current_salary || 0)} 대비 최적의 상여금 설정]
        `;
      } else if (mode === 'gift') {
        prompt = `
          당신은 30년 경력의 대한민국 최고 상속/증여 전문 세무사입니다. 유찬영 세무사 등 업계 거장들이 강조하는 "국세청도 허락한 합법적 절세 비법"을 사용자에게 전수하세요.
          사용자가 입력한 데이터를 바탕으로 [2026년 최신 개정 세법]을 반영한 절세 리포트를 작성하세요.

          [사용자 입력 데이터]
          - 관계: ${formData.recipient}
          - 자산 종류: ${formData.asset_type}
          - 금액: ${formatKRW(formData.amount_krw)}
          - 평가 방식: ${formData.valuation_method || '미지정'}
          - 법인 활용 여부: ${formData.is_corp_acquisition ? '부동산 임대 법인 설립 고려 중' : '개인 명의'}
          - 특이사항: ${formData.special_event} (혼인/출산 공제 적용 여부 확인)
          - 수증자 소득: ${formData.income_status}

          [리포트 구성 요소]
          1. **예상 세금**: 공제액을 제외한 실제 납부 세액 계산
          2. **30년차 세무사의 '자산별' 시크릿 전략**: 
             - ${formData.asset_type === '아파트' ? '아파트는 유사 매매사례가액이 우선 적용되므로, 증여 시점 조절을 통한 절세 전략. 특히 국세청 감정평가사업(꼬마빌딩 등)의 타겟이 되지 않도록 주의할 점.' : ''}
             - ${['꼬마빌딩/상가', '다가구/단독주택'].includes(formData.asset_type) ? '꼬마빌딩/상가는 시가 파악이 어려워 감정평가나 기준시가를 활용할 수 있습니다. 국세청이 직접 감정평가를 하기 전에, 우리가 먼저 유리한 감정평가법인을 통해 시가보다 낮게(하지만 합리적으로) 평가받아 증여세를 낮추는 "선제적 감정평가" 전략을 제시하세요.' : ''}
             - ${formData.asset_type === '꼬마빌딩/상가' && formData.is_corp_acquisition ? '부동산 임대 법인을 설립하여 부모로부터 자금을 빌리고(차용), 은행 LTV를 최대한 활용하여 자녀 법인이 건물을 매수하게 함으로써 증여세 없이 수십억 자산을 이전하는 "법인 레버리지 전략"을 상세히 설명하세요. (부모 자금 대여 시 적정 이자율 4.6% 준수 및 차용증 작성 필수)' : ''}
             - ${formData.asset_type === '비상장주식' ? '비상장주식은 증여 전 배당 확대, 이익 조절, 임원 퇴직금 지급 등을 통해 주식 가치를 인위적으로 크게 떨어뜨린 후 증여하는 전략이 핵심입니다. 순자산가치와 순손익가치 가중평균 원리를 활용한 "주가 다이어트" 비법을 설명해주세요.' : ''}
             - 혼인/출산 증여재산 공제(최대 1억 추가) 활용법
          3. **VVIP 시나리오 제안 (국세청도 허락한 방법)**: 
             - "자녀 법인에 현금 증여 후, 그 법인이 부모의 부동산이나 주식을 저가 매수하는 전략"
             - "영업권 평가를 통한 법인 자금의 비과세 개인화"
             - "가족 법인을 활용한 부동산 임대업 전환 및 가업승계 주식 증여세 과세특례 활용"
             - 위 시나리오 중 가장 적합한 것을 하나 골라 상세히 설명하고, '부당행위계산부인' 및 '증여세 완전포괄주의' 리스크를 피하는 법을 조언할 것.
          4. **주의사항**: 자금출처조사 소명 대비책 및 국세청의 '감정평가사업' 대응 전략

          [출력 가이드]
          - **30년차 세무사의 노련함과 자신감**이 묻어나는 말투로 작성하세요.
          - 할머니/할아버지도 이해할 수 있는 아주 쉬운 용어를 사용하세요. (예: "주가 다이어트", "선제 공격 감정평가")
          - 마크다운 문법을 적극 활용하고, 섹션은 가로선(---)으로 구분하세요.
          - 반응형 HTML 구조로 작성하여 PDF 인쇄 시 깨지지 않도록 하세요.
          - 스타일은 Tailwind CSS 클래스를 사용하세요.
        `;
      } else if (mode === 'cit') {
        prompt = `
          너는 대한민국 국세청 데이터를 기반으로 작동하는 '종합소득세 경비 처리 및 절세 컨설턴트'야.
          사업자의 [업종], [매출], [기장 방식], [주요 지출] 데이터를 분석하여 절세 전략을 마크다운으로 출력해.

          [입력 데이터]
          - 업종: ${formData.business_type}
          - 연 매출: ${formatKRW(formData.annual_revenue || 0)}
          - 기장 방식: ${formData.bookkeeping_method}
          - 주요 지출: ${formData.major_expenses?.join(', ')}

          [출력 가이드]
          1. **초보 사장님도 이해할 수 있는 쉬운 용어**를 사용해줘.
          2. 해당 업종에서 놓치기 쉬운 **필수 경비 항목**을 추천해줘.
          3. 적격증빙(세금계산서, 카드영수증 등)의 중요성을 강조해줘.
          4. 노란우산공제 등 사업자라면 꼭 챙겨야 할 공제 혜택을 언급해줘.
          5. 마크다운 문법과 가로선(---)을 활용해 깔끔하게 보여줘.

          [출력 포맷]
          ## 🏢 사장님을 위한 종합소득세 절세 리포트
          ---
          ### 1. 🔍 현재 상태 진단
          
          - **업종:** ${formData.business_type}
          - **매출 규모:** ${formatKRW(formData.annual_revenue || 0)}
          - **진단:** [매출 대비 경비율이 적절한지, 기장 방식이 유리한지 분석]

          ---
          ### 2. 💰 놓치고 있는 '숨은 경비' 찾기
          
          - **추천 항목:** [업종에 맞는 경비 항목 3~4개]
          - **꿀팁:** [가족 경영, 차량 유지비 등 실질적인 팁]

          ---
          ### 3. 🚨 세무조사 방어 및 공제 혜택
          
          - **필수 체크:** 적격증빙 관리법
          - **추천 공제:** 노란우산공제, 창업중소기업 세액감면 등
        `;
      }

      const response = await ai.models.generateContent({
        model: "gemini-3.1-pro-preview",
        contents: prompt,
      });

      setAiReport(response.text || "리포트 생성에 실패했습니다.");
    } catch (error: any) {
      console.error(error);
      if (error?.status === 429 || error?.message?.includes('429') || error?.message?.includes('RESOURCE_EXHAUSTED')) {
        setAiReport(`
<div class="p-6 bg-red-50 border border-red-200 rounded-2xl text-red-900">
  <h3 class="text-xl font-black mb-2 flex items-center gap-2"><ShieldAlert size="24" /> API 한도 초과 (Quota Exceeded)</h3>
  <p class="mb-4">Gemini API의 무료 사용량 한도를 초과했습니다. 다음 단계를 확인해 주세요:</p>
  <ul class="list-disc pl-5 space-y-2 font-medium">
    <li>잠시 후 다시 시도해 보세요.</li>
    <li>Google AI Studio에서 결제 정보를 확인하거나 한도를 늘려주세요.</li>
    <li><a href="https://ai.google.dev/gemini-api/docs/rate-limits" target="_blank" class="underline text-red-700 hover:text-red-900">Rate Limits 문서 확인하기</a></li>
  </ul>
</div>
        `);
      } else {
        setAiReport("AI 분석 중 오류가 발생했습니다. 다시 시도해주세요.");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const nextStep = () => setStep(s => s + 1);
  const prevStep = () => setStep(s => s - 1);

  // --- Render Helpers ---

  const StepWrapper = ({ children, title, description }: { children: React.ReactNode, title: string, description?: string }) => (
    <motion.div 
      className="w-full max-w-xl mx-auto"
    >
      <div className="mb-8 text-center">
        <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">{title}</h2>
        {description && <p className="text-slate-500 text-sm">{description}</p>}
      </div>
      <div className="space-y-3">
        {children}
      </div>
    </motion.div>
  );

  const OptionButton = ({ label, icon: Icon, selected, onClick, sublabel }: any) => (
    <button
      onClick={onClick}
      className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all duration-200 group ${
        selected 
          ? 'border-indigo-600 bg-indigo-50 shadow-md' 
          : 'border-slate-100 bg-white hover:border-indigo-200 hover:bg-slate-50'
      }`}
    >
      <div className="flex items-center gap-4">
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${
          selected ? 'bg-indigo-600 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-indigo-100 group-hover:text-indigo-600'
        }`}>
          {Icon && <Icon size={20} />}
        </div>
        <div className="text-left">
          <p className={`font-bold ${selected ? 'text-indigo-900' : 'text-slate-700'}`}>{label}</p>
          {sublabel && <p className="text-xs text-slate-400 mt-0.5">{sublabel}</p>}
        </div>
      </div>
      <ChevronRight size={18} className={selected ? 'text-indigo-600' : 'text-slate-300'} />
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-slate-900 font-sans selection:bg-indigo-100 flex flex-col">
      {/* Header */}
      <header className="bg-white/80 backdrop-blur-md border-b border-slate-200 sticky top-0 z-50">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setStep(0)}>
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white shadow-lg shadow-indigo-200">
              <Calculator size={18} />
            </div>
            <h1 className="font-black text-lg tracking-tighter">K-TAX <span className="text-indigo-600">2026</span></h1>
          </div>
          
          {step > 0 && step < 6 && (
            <div className="flex items-center gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <div 
                  key={i} 
                  className={`h-1.5 rounded-full transition-all duration-300 ${
                    i === step ? 'w-8 bg-indigo-600' : i < step ? 'w-4 bg-indigo-200' : 'w-2 bg-slate-200'
                  }`} 
                />
              ))}
            </div>
          )}

          <div className="hidden sm:flex items-center gap-4 text-[10px] font-bold text-slate-400 uppercase tracking-widest">
            <span>Real-time Analysis</span>
          </div>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6 sm:p-12">
        <AnimatePresence mode="wait">
          {step === 0 && (
            <motion.div 
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="max-w-2xl w-full text-center"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-xs font-bold mb-6">
                <Sparkles size={14} />
                <span>2026년 개정 세법 완벽 반영</span>
              </div>
              <h1 className="text-4xl sm:text-6xl font-black text-slate-900 mb-6 tracking-tighter leading-none">
                세무사 상담 전,<br />
                <span className="text-indigo-600">AI로 1분 만에</span> 체크하세요.
              </h1>
              <p className="text-slate-500 text-lg mb-10 max-w-lg mx-auto leading-relaxed">
                대한민국 국세청 데이터를 기반으로 증여세 계산부터 자금출처조사 리스크까지 한 번에 분석합니다.
              </p>
              
              <div className="space-y-10">
                {/* Individual/Family Section */}
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <UserCircle2 size={14} /> 개인/가족 절세 시뮬레이션
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <button 
                      onClick={() => {
                        setMode('gift');
                        setStep(1);
                      }}
                      className="group bg-slate-900 text-white p-6 rounded-3xl text-left hover:bg-indigo-600 transition-all duration-300 shadow-xl shadow-slate-200"
                    >
                      <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center mb-4 group-hover:bg-white/20">
                        <Coins size={20} />
                      </div>
                      <p className="font-bold text-lg">증여/상속 시뮬레이션</p>
                      <p className="text-sm text-white/60">자산 이전 시 발생하는 세금과 절세 전략</p>
                    </button>
                  </div>
                </div>

                {/* Corporate/Business Section */}
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-[0.2em] mb-6 flex items-center gap-2">
                    <Building size={14} /> 법인/사업자 VVIP 컨설팅
                  </h3>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <button 
                      onClick={() => {
                        setMode('cit');
                        setStep(1);
                      }}
                      className="group bg-white border-2 border-slate-100 p-6 rounded-3xl text-left hover:border-indigo-600 transition-all duration-300"
                    >
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        <Briefcase size={20} />
                      </div>
                      <p className="font-bold text-lg text-slate-800">종소세 경비 컨설팅</p>
                      <p className="text-sm text-slate-400">사업자 경비 처리 및 절세 전략 분석</p>
                    </button>
                    <button 
                      onClick={() => {
                        setMode('corp_convert');
                        setStep(1);
                      }}
                      className="group bg-white border-2 border-slate-100 p-6 rounded-3xl text-left hover:border-indigo-600 transition-all duration-300"
                    >
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        <Zap size={20} />
                      </div>
                      <p className="font-bold text-lg text-slate-800">법인 전환 & 영업권 평가</p>
                      <p className="text-sm text-slate-400">개인사업자 법인 전환 최적 타이밍 분석</p>
                    </button>
                    <button 
                      onClick={() => {
                        setMode('temp_payment');
                        setStep(1);
                      }}
                      className="group bg-white border-2 border-slate-100 p-6 rounded-3xl text-left hover:border-indigo-600 transition-all duration-300"
                    >
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        <Scale size={20} />
                      </div>
                      <p className="font-bold text-lg text-slate-800">가지급금 해체 시뮬레이터</p>
                      <p className="text-sm text-slate-400">법인 대표의 시한폭탄, 가지급금 안전 정산</p>
                    </button>
                    <button 
                      onClick={() => {
                        setMode('surplus_exit');
                        setStep(1);
                      }}
                      className="group bg-white border-2 border-slate-100 p-6 rounded-3xl text-left hover:border-indigo-600 transition-all duration-300"
                    >
                      <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center mb-4 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                        <History size={20} />
                      </div>
                      <p className="font-bold text-lg text-slate-800">이익잉여금 엑시트</p>
                      <p className="text-sm text-slate-400">법인에 쌓인 현금, 세금 최소화 인출 전략</p>
                    </button>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest">Trusted by 10,000+ users</p>
            </motion.div>
          )}

          {step === 1 && (
            <motion.div key="step1" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              {mode === 'cit' ? (
                <StepWrapper title="어떤 업종을 운영하시나요?" description="업종에 따라 인정되는 경비율과 절세 전략이 달라집니다.">
                  <OptionButton label="서비스업" sublabel="강의, 컨설팅, IT 등" icon={Briefcase} selected={formData.business_type === '서비스업'} onClick={() => { setFormData({ ...formData, business_type: '서비스업' }); nextStep(); }} />
                  <OptionButton label="도소매업" sublabel="온라인 쇼핑몰, 매장 등" icon={Wallet} selected={formData.business_type === '도소매업'} onClick={() => { setFormData({ ...formData, business_type: '도소매업' }); nextStep(); }} />
                  <OptionButton label="음식업" sublabel="식당, 카페 등" icon={Coins} selected={formData.business_type === '음식업'} onClick={() => { setFormData({ ...formData, business_type: '음식업' }); nextStep(); }} />
                  <OptionButton label="기타" sublabel="제조, 건설 등" icon={UserCircle2} selected={formData.business_type === '기타'} onClick={() => { setFormData({ ...formData, business_type: '기타' }); nextStep(); }} />
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              ) : mode === 'corp_convert' ? (
                <StepWrapper title="현재 연 매출액은 얼마인가요?" description="법인 전환의 첫 번째 기준은 매출 규모입니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.annual_revenue || ''} 
                        onChange={(e) => setFormData({ ...formData, annual_revenue: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'temp_payment' ? (
                <StepWrapper title="현재 쌓여있는 가지급금은 얼마인가요?" description="법인 통장에서 개인 용도로 사용된 금액을 입력해주세요.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-red-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.temp_payment_amount || ''} 
                        onChange={(e) => setFormData({ ...formData, temp_payment_amount: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-red-600 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'surplus_exit' ? (
                <StepWrapper title="인출하고 싶은 잉여금은 얼마인가요?" description="법인에 쌓인 현금 중 개인화하고 싶은 목표 금액입니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.exit_amount || ''} 
                        onChange={(e) => setFormData({ ...formData, exit_amount: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : (
                <StepWrapper title="누구에게 자산을 이전하시나요?" description="수증자와의 관계에 따라 공제 한도가 달라집니다.">
                  {['성인 자녀', '미성년 자녀', '배우자', '사위/며느리', '기타'].map((r) => (
                    <OptionButton 
                      key={r} 
                      label={r} 
                      icon={UserCircle2} 
                      selected={formData.recipient === r}
                      onClick={() => { setFormData({ ...formData, recipient: r }); nextStep(); }}
                    />
                  ))}
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              )}
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="step2" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              {mode === 'cit' ? (
                <StepWrapper title="연간 예상 매출액은 얼마인가요?" description="매출 규모에 따라 기장 의무와 세율이 결정됩니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.annual_revenue || ''} 
                        onChange={(e) => setFormData({ ...formData, annual_revenue: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">
                      다음으로
                    </button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'corp_convert' ? (
                <StepWrapper title="연간 순이익(소득)은 얼마인가요?" description="매출에서 모든 경비를 제외한 실제 소득을 입력해주세요.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.net_profit || ''} 
                        onChange={(e) => setFormData({ ...formData, net_profit: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'temp_payment' ? (
                <StepWrapper title="법인의 잉여 현금은 얼마인가요?" description="가지급금을 상계하기 위해 활용 가능한 현금성 자산입니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.surplus_cash || ''} 
                        onChange={(e) => setFormData({ ...formData, surplus_cash: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'surplus_exit' ? (
                <StepWrapper title="현재 대표님의 연봉은 얼마인가요?" description="최적의 엑시트 비율을 찾기 위한 기초 데이터입니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.current_salary || ''} 
                        onChange={(e) => setFormData({ ...formData, current_salary: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={nextStep} className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-slate-800 transition-all">다음으로</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : (
                <StepWrapper title="이전할 자산의 종류는 무엇인가요?" description="자산 종류에 따라 평가 방식과 리스크가 다릅니다.">
                  <OptionButton label="현금" icon={Coins} selected={formData.asset_type === '현금'} onClick={() => { setFormData({ ...formData, asset_type: '현금' }); nextStep(); }} />
                  <OptionButton label="아파트" icon={Home} selected={formData.asset_type === '아파트'} onClick={() => { setFormData({ ...formData, asset_type: '아파트' }); nextStep(); }} />
                  <OptionButton label="꼬마빌딩/상가" icon={Building2} selected={formData.asset_type === '꼬마빌딩/상가'} onClick={() => { setFormData({ ...formData, asset_type: '꼬마빌딩/상가' }); nextStep(); }} />
                  <OptionButton label="다가구/단독주택" icon={Building} selected={formData.asset_type === '다가구/단독주택'} onClick={() => { setFormData({ ...formData, asset_type: '다가구/단독주택' }); nextStep(); }} />
                  <OptionButton label="비상장주식" icon={TrendingDown} selected={formData.asset_type === '비상장주식'} onClick={() => { setFormData({ ...formData, asset_type: '비상장주식' }); nextStep(); }} />
                  <OptionButton label="상장주식" icon={CreditCard} selected={formData.asset_type === '상장주식'} onClick={() => { setFormData({ ...formData, asset_type: '상장주식' }); nextStep(); }} />
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              )}
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="step3" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              {mode === 'cit' ? (
                <StepWrapper title="현재 어떤 방식으로 장부를 쓰시나요?" description="기장 방식에 따라 절세 가능한 세액공제가 달라집니다.">
                  <OptionButton label="간편장부" sublabel="매출이 적은 초기 사업자" icon={FileText} selected={formData.bookkeeping_method === '간편장부'} onClick={() => { setFormData({ ...formData, bookkeeping_method: '간편장부' }); nextStep(); }} />
                  <OptionButton label="복식부기" sublabel="전문적인 회계 관리" icon={ShieldAlert} selected={formData.bookkeeping_method === '복식부기'} onClick={() => { setFormData({ ...formData, bookkeeping_method: '복식부기' }); nextStep(); }} />
                  <OptionButton label="모름/미작성" sublabel="추계 신고 예정" icon={X} selected={formData.bookkeeping_method === '모름/미작성'} onClick={() => { setFormData({ ...formData, bookkeeping_method: '모름/미작성' }); nextStep(); }} />
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              ) : mode === 'corp_convert' ? (
                <StepWrapper title="대표님의 연간 필요 생활비는 얼마인가요?" description="법인 전환 후 급여 설정을 위한 핵심 데이터입니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.living_expenses || ''} 
                        onChange={(e) => setFormData({ ...formData, living_expenses: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: 원</p>
                    </div>
                    <button onClick={handleGenerateReport} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all">분석 리포트 생성</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : mode === 'temp_payment' ? (
                <StepWrapper title="대표 명의의 특허/상표권이 있나요?" description="산업재산권 자본화는 가지급금 해결의 가장 강력한 도구입니다.">
                  <OptionButton label="있음" sublabel="특허, 상표권 보유 중" icon={Zap} selected={formData.has_patent === true} onClick={() => { setFormData({ ...formData, has_patent: true }); handleGenerateReport(); }} />
                  <OptionButton label="없음" sublabel="현재 보유 중인 권리 없음" icon={X} selected={formData.has_patent === false} onClick={() => { setFormData({ ...formData, has_patent: false }); handleGenerateReport(); }} />
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              ) : mode === 'surplus_exit' ? (
                <StepWrapper title="주주 구성(자녀/배우자 지분율)은 어떻게 되나요?" description="분산 배당을 통한 절세 효과를 분석합니다.">
                  <div className="space-y-6">
                    <div className="bg-slate-50 p-8 rounded-[2rem] border-2 border-slate-100 focus-within:border-indigo-600 transition-all">
                      <input 
                        type="number" 
                        value={formData.child_share_ratio || ''} 
                        onChange={(e) => setFormData({ ...formData, child_share_ratio: Number(e.target.value) })}
                        className="w-full bg-transparent text-4xl font-black text-slate-900 outline-none placeholder:text-slate-200"
                        placeholder="0"
                        autoFocus
                      />
                      <p className="text-slate-400 font-bold mt-2">단위: %</p>
                    </div>
                    <button onClick={handleGenerateReport} className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all">분석 리포트 생성</button>
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </div>
                </StepWrapper>
              ) : (
                <StepWrapper title="이전할 금액(가치)은 얼마인가요?" description="정확한 시세나 이체 예정 금액을 입력해주세요.">
                  {/* Dynamic Tips based on asset type */}
                  {['꼬마빌딩/상가', '다가구/단독주택'].includes(formData.asset_type) && (
                    <div className="mb-6 p-5 bg-amber-50 border border-amber-200 rounded-2xl text-sm text-amber-900 leading-relaxed shadow-sm">
                      <p className="font-black flex items-center gap-1 mb-2 text-amber-700"><Lightbulb size={16} /> 30년차 세무사의 팁</p>
                      <p>꼬마빌딩이나 상가는 과거 기준시가(공시지가)로 신고하는 경우가 많았으나, 최근 국세청이 <strong>직접 감정평가를 실시하여 시가로 과세</strong>하는 추세입니다. 보수적인 시뮬레이션을 위해 기준시가가 아닌 <strong>예상 시가(또는 감정가액)</strong>를 입력하시는 것을 권장합니다.</p>
                    </div>
                  )}
                  {formData.asset_type === '아파트' && (
                    <div className="mb-6 p-5 bg-blue-50 border border-blue-200 rounded-2xl text-sm text-blue-900 leading-relaxed shadow-sm">
                      <p className="font-black flex items-center gap-1 mb-2 text-blue-700"><Lightbulb size={16} /> 평가 팁</p>
                      <p>아파트는 원칙적으로 <strong>유사 매매사례가액(최근 실거래가)</strong>이 우선 적용됩니다. 국토교통부 실거래가를 참고하여 현재 시세를 입력해주세요.</p>
                    </div>
                  )}
                  {formData.asset_type === '비상장주식' && (
                    <div className="mb-6 p-5 bg-indigo-50 border border-indigo-200 rounded-2xl text-sm text-indigo-900 leading-relaxed shadow-sm">
                      <p className="font-black flex items-center gap-1 mb-2 text-indigo-700"><Lightbulb size={16} /> 평가 팁</p>
                      <p>비상장주식은 <strong>순손익가치와 순자산가치를 가중평균</strong>하여 평가합니다. 세무 대리인을 통해 가결산된 예상 1주당 가치 × 주식 수를 입력해주세요.</p>
                    </div>
                  )}

                  <div className="bg-white border-2 border-indigo-600 rounded-3xl p-8 shadow-xl shadow-indigo-50">
                    <div className="flex items-baseline justify-center gap-2 mb-4">
                      <input 
                        type="number" 
                        autoFocus
                        value={formData.amount_krw / 10000}
                        onChange={(e) => setFormData({ ...formData, amount_krw: Number(e.target.value) * 10000 })}
                        className="w-full text-center text-5xl font-black text-slate-900 outline-none bg-transparent"
                      />
                      <span className="text-2xl font-bold text-slate-400">만원</span>
                    </div>
                    <p className="text-center text-indigo-600 font-bold text-lg">{formatKRW(formData.amount_krw)}</p>
                  </div>
                  <button 
                    onClick={nextStep}
                    className="w-full bg-slate-900 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-600 transition-all mt-4"
                  >
                    확인
                  </button>
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              )}
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="step4" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              {mode === 'cit' ? (
                <StepWrapper title="주요 지출 항목을 선택해주세요 (중복 가능)" description="경비 처리가 가능한 항목들을 분석해드립니다.">
                  <div className="grid grid-cols-2 gap-3">
                    {['임대료', '인건비', '광고비', '차량유지비', '접대비', '소모품비'].map(item => (
                      <button 
                        key={item}
                        onClick={() => {
                          const current = formData.major_expenses || [];
                          const next = current.includes(item) ? current.filter(i => i !== item) : [...current, item];
                          setFormData({ ...formData, major_expenses: next });
                        }}
                        className={`p-4 rounded-2xl border-2 font-bold text-sm transition-all ${formData.major_expenses?.includes(item) ? 'border-indigo-600 bg-indigo-50 text-indigo-600' : 'border-slate-100 bg-white text-slate-400 hover:border-slate-200'}`}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                  <button 
                    onClick={handleGenerateReport}
                    className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all mt-6 flex items-center justify-center gap-2"
                  >
                    <ShieldAlert size={20} /> 컨설팅 리포트 생성
                  </button>
                  <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                    <ArrowLeft size={16} /> 이전으로
                  </button>
                </StepWrapper>
              ) : (
                <div className="space-y-6">
                  {['아파트', '꼬마빌딩/상가', '다가구/단독주택'].includes(formData.asset_type) && (
                    <StepWrapper title="어떤 가액으로 신고하실 예정인가요?" description="부동산 종류에 따라 유리한 평가 방식이 다릅니다.">
                      <OptionButton label="시가 (매매사례가액)" sublabel="아파트 등 유사 거래가 있는 경우" icon={Search} selected={formData.valuation_method === '시가'} onClick={() => setFormData({ ...formData, valuation_method: '시가' })} />
                      <OptionButton label="공시지가 (기준시가)" sublabel="상가, 다가구 등 시가 파악이 어려운 경우" icon={FileText} selected={formData.valuation_method === '공시지가'} onClick={() => setFormData({ ...formData, valuation_method: '공시지가' })} />
                      <OptionButton label="감정평가" sublabel="절세를 위해 감정가를 낮추고 싶은 경우" icon={Gavel} selected={formData.valuation_method === '감정평가'} onClick={() => setFormData({ ...formData, valuation_method: '감정평가' })} />
                    </StepWrapper>
                  )}

                  {formData.asset_type === '꼬마빌딩/상가' && (
                    <StepWrapper title="부동산 임대 법인 설립을 고려하시나요?" description="부모님 자금 대여 + 은행 LTV를 활용한 절세 전략입니다.">
                      <OptionButton label="네, 고려 중입니다" sublabel="법인 설립 후 자산 이전 전략" icon={Building} selected={formData.is_corp_acquisition === true} onClick={() => setFormData({ ...formData, is_corp_acquisition: true })} />
                      <OptionButton label="아니오" sublabel="개인 명의로 진행" icon={UserCircle2} selected={formData.is_corp_acquisition === false} onClick={() => setFormData({ ...formData, is_corp_acquisition: false })} />
                    </StepWrapper>
                  )}

                  <StepWrapper title="자녀의 결혼 또는 출산 계획이 있나요?" description="2026년 기준 최대 1억 원의 추가 공제가 가능합니다.">
                    <OptionButton label="혼인" sublabel="혼인신고 전후 2년 이내" icon={Heart} selected={formData.special_event === '혼인'} onClick={() => { setFormData({ ...formData, special_event: '혼인' }); nextStep(); }} />
                    <OptionButton label="출산" sublabel="출생일 후 2년 이내" icon={Baby} selected={formData.special_event === '출산'} onClick={() => { setFormData({ ...formData, special_event: '출산' }); nextStep(); }} />
                    <OptionButton label="해당 없음" icon={X} selected={formData.special_event === '해당 없음'} onClick={() => { setFormData({ ...formData, special_event: '해당 없음' }); nextStep(); }} />
                    <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                      <ArrowLeft size={16} /> 이전으로
                    </button>
                  </StepWrapper>
                </div>
              )}
            </motion.div>
          )}

          {step === 5 && (
            <motion.div key="step5" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="w-full">
              <StepWrapper title="수증자의 현재 소득 상태는?" description="차용증 작성 시 이자 상환 능력을 판별하는 핵심 기준입니다.">
                <OptionButton label="직장인/사업자" sublabel="소득 증빙 충분" icon={Briefcase} selected={formData.income_status === '직장인/사업자 (소득 증빙 충분)'} onClick={() => { setFormData({ ...formData, income_status: '직장인/사업자 (소득 증빙 충분)' }); }} />
                <OptionButton label="사회초년생" sublabel="소득 적음" icon={CreditCard} selected={formData.income_status === '사회초년생 (소득 적음)'} onClick={() => { setFormData({ ...formData, income_status: '사회초년생 (소득 적음)' }); }} />
                <OptionButton label="무직/학생" sublabel="소득 없음" icon={UserCircle2} selected={formData.income_status === '무직/학생'} onClick={() => { setFormData({ ...formData, income_status: '무직/학생' }); }} />
                
                <div className="mt-4">
                  <button 
                    onClick={() => setShowIncomeHelp(!showIncomeHelp)}
                    className="text-xs text-indigo-600 font-bold flex items-center gap-1 hover:underline"
                  >
                    <Lightbulb size={14} /> '소득 적음'의 기준이 궁금하신가요?
                  </button>
                  <AnimatePresence>
                    {showIncomeHelp && (
                      <motion.div 
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="mt-4 p-5 bg-indigo-50 rounded-2xl text-xs text-indigo-900 space-y-3 leading-relaxed border border-indigo-100">
                          <p><strong>💡 국세청 자금출처조사 판단 기준:</strong></p>
                          <ul className="list-disc pl-4 space-y-1">
                            <li><strong>생활비 제외 원칙:</strong> 월급에서 생활비를 쓰고 남은 돈이 부모님께 드릴 <strong>이자보다 적으면</strong> 증여로 의심받습니다.</li>
                            <li><strong>연령별 면제 한도:</strong> 30세 미만은 주택 5천만원, 30세 이상은 1.5억까지는 조사가 덜하지만, 그 이상은 소득 증빙이 필수입니다.</li>
                            <li><strong>사회초년생 기준:</strong> 통상 연봉 3,000만원 미만이거나 취업 1~2년 차인 경우를 의미합니다.</li>
                          </ul>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                <button 
                  onClick={handleGenerateReport}
                  className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-bold text-lg shadow-lg hover:bg-indigo-700 transition-all mt-6 flex items-center justify-center gap-2"
                >
                  <ShieldAlert size={20} /> AI 리포트 생성하기
                </button>
                <button onClick={prevStep} className="w-full py-4 text-slate-400 text-sm font-bold flex items-center justify-center gap-2 hover:text-slate-600 transition-colors">
                  <ArrowLeft size={16} /> 이전으로
                </button>
              </StepWrapper>
            </motion.div>
          )}

          {step === 6 && (
            <motion.div 
              key="result"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-6xl w-full space-y-10"
            >
              {/* Landing Page Style A/B Comparison */}
              <div className="text-center space-y-4 mb-12">
                <div className={`inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-black uppercase tracking-widest ${
                  mode === 'cit' ? 'bg-indigo-50 text-indigo-600' :
                  taxResult.finalTax === 0 ? 'bg-indigo-50 text-indigo-600' : 'bg-emerald-50 text-emerald-600'
                }`}>
                  <Sparkles size={14} />
                  <span>
                    {mode === 'cit' ? '사업자 맞춤형 절세 분석 완료' : 
                     taxResult.finalTax === 0 ? "현재 세금 0원 시나리오" : "최적의 절세 시나리오 발견"}
                  </span>
                </div>
                <h2 className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter">
                  {mode === 'cit' ? (
                    <>종합소득세 <span className="text-indigo-600">절세 리포트</span></>
                  ) : taxResult.finalTax === 0 ? (
                    <>그냥 주셔도 <span className="text-indigo-600">세금이 0원</span>입니다.</>
                  ) : (
                    <>단순 증여보다 <span className="text-emerald-600">차용이 유리</span>합니다.</>
                  )}
                </h2>
                <p className="text-slate-500 max-w-2xl mx-auto">
                  {mode === 'cit' ? (
                    <>사장님의 업종과 매출 규모에 맞춘 최적의 경비 처리 가이드입니다.</>
                  ) : (
                    <>{formData.recipient}에게 {formatKRW(formData.amount_krw)}을 이전할 때, 아래 두 시나리오의 세금 차이를 확인하세요.</>
                  )}
                </p>
              </div>

              {mode === 'gift' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 relative">
                  {/* Result Reveal Overlay */}
                  {taxResult.finalTax > 0 && !isRevealed && (
                    <div className="absolute inset-0 z-50 flex items-center justify-center p-4">
                      <motion.div 
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-white/80 backdrop-blur-2xl border border-white p-10 rounded-[3rem] shadow-2xl text-center max-w-md"
                      >
                        <div className="w-20 h-20 bg-red-50 text-red-500 rounded-3xl flex items-center justify-center mx-auto mb-6">
                          <ShieldAlert size={40} />
                        </div>
                        <h3 className="text-2xl font-black text-slate-900 mb-4 tracking-tighter">세금이 발생할 수 있습니다</h3>
                        <p className="text-slate-500 mb-8 leading-relaxed">
                          그냥 물려주시면 세금이 나옵니다. <br />
                          AI가 제안하는 0원 절세법을 확인하시겠습니까?
                        </p>
                        <button 
                          onClick={() => setIsRevealed(true)}
                          className="w-full bg-indigo-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-indigo-200 hover:bg-indigo-700 transition-all active:scale-95"
                        >
                          결과 확인하기
                        </button>
                      </motion.div>
                    </div>
                  )}

                  {/* Scenario A Card */}
                  <div className={`bg-white rounded-[2.5rem] border-2 border-slate-100 p-8 sm:p-10 relative overflow-hidden group hover:border-slate-200 transition-all ${taxResult.finalTax > 0 && !isRevealed ? 'animate-wavy-blur' : ''}`}>
                    <div className="absolute top-0 right-0 p-6 opacity-5 group-hover:opacity-10 transition-opacity">
                      <X size={120} />
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-slate-100 rounded-xl flex items-center justify-center text-slate-400">
                          <Coins size={20} />
                        </div>
                        <span className="font-black text-slate-400 uppercase tracking-widest text-sm">시나리오 A: 그냥 줄 때</span>
                      </div>
                      <div className="space-y-6">
                        <div>
                          <p className="text-slate-500 text-sm mb-1">내야 할 예상 세금</p>
                          <p className="text-5xl font-black text-slate-900 tracking-tighter">{formatKRW(taxResult.finalTax)}</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <CheckCircle2 size={16} className="text-slate-300" />
                            <span>나라에서 깎아주는 금액: {formatKRW(formData.amount_krw - taxResult.taxBase)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-slate-600">
                            <CheckCircle2 size={16} className="text-slate-300" />
                            <span>물려받는 즉시 자녀의 재산이 됨</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-red-500 font-bold">
                            <AlertTriangle size={16} />
                            <span>나중에 또 주면 세금이 더 커짐</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Scenario B Card */}
                  <div className={`bg-slate-900 rounded-[2.5rem] p-8 sm:p-10 relative overflow-hidden shadow-2xl shadow-indigo-200 group ${taxResult.finalTax > 0 && !isRevealed ? 'animate-wavy-blur' : ''}`}>
                    <div className="absolute top-0 right-0 p-6 opacity-10 group-hover:opacity-20 transition-opacity text-indigo-400">
                      <Sparkles size={120} />
                    </div>
                    <div className="absolute top-6 right-6">
                      <div className="bg-indigo-600 text-white px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-widest animate-bounce">
                        AI 추천
                      </div>
                    </div>
                    <div className="relative z-10">
                      <div className="flex items-center gap-3 mb-8">
                        <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white">
                          <ShieldAlert size={20} />
                        </div>
                        <span className="font-black text-indigo-400 uppercase tracking-widest text-sm">시나리오 B: 돈 빌려주기</span>
                      </div>
                      <div className="space-y-6">
                        <div>
                          <p className="text-indigo-300/60 text-sm mb-1">내야 할 예상 세금</p>
                          <p className="text-5xl font-black text-white tracking-tighter">0원</p>
                        </div>
                        <div className="space-y-3">
                          <div className="flex items-center gap-2 text-sm text-indigo-100/80">
                            <Sparkles size={16} className="text-indigo-400" />
                            <span className="font-bold text-indigo-400">아끼는 세금: {formatKRW(taxResult.finalTax)}</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-indigo-100/80">
                            <CheckCircle2 size={16} className="text-indigo-400" />
                            <span>매달 {formatKRW(loanScenario.monthlyInterest)} 이자 보내기</span>
                          </div>
                          <div className="flex items-center gap-2 text-sm text-indigo-100/80">
                            <CheckCircle2 size={16} className="text-indigo-400" />
                            <span>나중에 더 큰 돈을 줄 때 유리함</span>
                          </div>
                        </div>
                      </div>
                      <div className="mt-10 pt-8 border-t border-white/10">
                        <div className="flex items-center justify-between">
                          <div className="text-xs text-white/40 uppercase font-bold tracking-widest">위험도 체크</div>
                          <div className="flex gap-1">
                            <div className="w-8 h-1.5 rounded-full bg-emerald-500" />
                            <div className="w-8 h-1.5 rounded-full bg-emerald-500" />
                            <div className={`w-8 h-1.5 rounded-full ${formData.income_status === '무직/학생' ? 'bg-red-500' : 'bg-emerald-500'}`} />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Detailed AI Report Section */}
              <div className="pt-10 print:pt-0">
                <div className="bg-white rounded-[3rem] border border-slate-200 shadow-sm overflow-hidden min-h-[600px] print:border-none print:shadow-none">
                  <div className="bg-slate-900 px-10 py-6 flex items-center justify-between no-print">
                    <div className="flex items-center gap-3 text-white">
                      <FileText size={20} className="text-indigo-400" />
                      <span className="font-black text-sm uppercase tracking-widest">AI 정밀 법률 리스크 리포트</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <button 
                        onClick={() => window.print()}
                        className="text-[10px] font-black text-slate-400 hover:text-white transition-colors flex items-center gap-1 uppercase tracking-widest"
                      >
                        PDF 저장 / 인쇄
                      </button>
                      <button 
                        onClick={() => setStep(1)}
                        className="text-[10px] font-black text-indigo-400 hover:text-indigo-300 transition-colors flex items-center gap-1 uppercase tracking-widest"
                      >
                        수정하기
                      </button>
                    </div>
                  </div>
                  <div className="p-10 sm:p-16 print:p-0">
                    {isGenerating ? (
                      <div className="space-y-10 animate-pulse no-print">
                        <div className="h-12 w-64 bg-slate-100 rounded-2xl" />
                        <div className="space-y-4">
                          <div className="h-4 w-full bg-slate-50 rounded" />
                          <div className="h-4 w-full bg-slate-50 rounded" />
                          <div className="h-4 w-5/6 bg-slate-50 rounded" />
                          <div className="h-4 w-4/6 bg-slate-50 rounded" />
                        </div>
                        <div className="h-64 w-full bg-slate-50 rounded-[2rem]" />
                      </div>
                    ) : (
                      <div className="markdown-body print:text-black">
                        <Markdown>{aiReport}</Markdown>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Print-Only Structured Report */}
              <div className="hidden print:block fixed inset-0 bg-white z-[9999] p-12 overflow-y-auto">
                <div className="max-w-4xl mx-auto border-4 border-slate-900 p-12">
                  <div className="text-center mb-12 border-b-4 border-slate-900 pb-8">
                    <h1 className="text-5xl font-black tracking-tighter mb-4">
                      {mode === 'cit' ? '종합소득세 절세 진단 보고서' : 
                       mode === 'corp_convert' ? '법인 전환 및 영업권 평가 보고서' :
                       mode === 'temp_payment' ? '가지급금 정산 로드맵 보고서' :
                       mode === 'surplus_exit' ? '이익잉여금 최적 인출 보고서' :
                       '상속/증여 시뮬레이션 결과 보고서'}
                    </h1>
                    <p className="text-slate-500 font-bold uppercase tracking-widest">K-TAX AI SIMULATOR 2026</p>
                  </div>

                  <div className="grid grid-cols-2 gap-8 mb-12">
                    <div className="space-y-4">
                      <h3 className="text-lg font-black border-b-2 border-slate-900 pb-2">1. 기본 정보</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {mode === 'gift' ? (
                          <>
                            <span className="text-slate-500">받는 사람</span><span className="font-bold">{formData.recipient}</span>
                            <span className="text-slate-500">자산 종류</span><span className="font-bold">{formData.asset_type}</span>
                            <span className="text-slate-500">물려받는 가치</span><span className="font-bold">{formatKRW(formData.amount_krw)}</span>
                            <span className="text-slate-500">소득 상태</span><span className="font-bold">{formData.income_status}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-500">업종/구분</span><span className="font-bold">{formData.business_type || '법인/사업자'}</span>
                            <span className="text-slate-500">매출/수익</span><span className="font-bold">{formatKRW(formData.annual_revenue || formData.net_profit || 0)}</span>
                            <span className="text-slate-500">분석 모드</span><span className="font-bold uppercase">{mode}</span>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="space-y-4">
                      <h3 className="text-lg font-black border-b-2 border-slate-900 pb-2">2. 핵심 요약</h3>
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        {mode === 'gift' ? (
                          <>
                            <span className="text-slate-500">단순 증여 시</span><span className="font-bold text-red-600">{formatKRW(taxResult.finalTax)}</span>
                            <span className="text-slate-500">AI 추천 대안</span><span className="font-bold text-emerald-600">0원</span>
                            <span className="text-slate-500">예상 절세액</span><span className="font-bold text-indigo-600">{formatKRW(taxResult.finalTax)}</span>
                          </>
                        ) : (
                          <>
                            <span className="text-slate-500">진단 결과</span><span className="font-bold text-indigo-600">최적화 가능</span>
                            <span className="text-slate-500">리스크 수준</span><span className="font-bold text-red-600">주의 요망</span>
                            <span className="text-slate-500">보고서 페이지</span><span className="font-bold text-slate-900">하단 참조</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="markdown-body">
                      <Markdown>{aiReport}</Markdown>
                    </div>
                  </div>

                  <div className="mt-20 pt-8 border-t-2 border-slate-100 text-center text-xs text-slate-400">
                    본 리포트는 AI 시뮬레이션 결과이며, 실제 세무 신고 전 반드시 전문가와 상담하시기 바랍니다.
                  </div>
                </div>
              </div>

              {/* Bottom Action */}
              <div className="text-center pb-20">
                <button 
                  onClick={() => setStep(0)}
                  className="inline-flex items-center gap-2 text-slate-400 hover:text-indigo-600 font-bold transition-colors group"
                >
                  <ArrowLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
                  처음으로 돌아가기
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-100 py-8">
        <div className="max-w-5xl mx-auto px-6 flex flex-col sm:flex-row justify-between items-center gap-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">© 2026 K-TAX AI SIMULATOR. ALL RIGHTS RESERVED.</p>
          <div className="flex items-center gap-6">
            <a href="#" className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Disclaimer</a>
            <a href="#" className="text-[10px] font-bold text-slate-400 hover:text-indigo-600 transition-colors uppercase tracking-widest">Privacy</a>
          </div>
        </div>
      </footer>
    </div>
  );
}
