import { useEffect, useState } from 'react';
import { analyzeIncidentWithAi } from '../api';
import type { AiForensicAnalysisResponse, IncidentDossier } from '../types';

interface AiForensicAdvisorProps {
  dossier: IncidentDossier;
}

const PRESET_QUESTIONS = [
  'Why did the merchant order miss or reject the payment update?',
  'Explain the cryptographic signature and replay findings for this order.',
  'Provide a safe idempotent Razorpay webhook handler pattern for this failure.',
];

export function AiForensicAdvisor({ dossier }: AiForensicAdvisorProps) {
  const [question, setQuestion] = useState(PRESET_QUESTIONS[0]);
  const [analysis, setAnalysis] = useState<AiForensicAnalysisResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setAnalysis(null);
    setError(null);
  }, [dossier.incident.id]);

  async function handleAnalyze(customPrompt?: string) {
    const query = (customPrompt ?? question).trim();
    setLoading(true);
    setError(null);
    try {
      const res = await analyzeIncidentWithAi(dossier.incident.id, query);
      setAnalysis(res);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'AI forensic synthesis failed.',
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="border border-[#262626] bg-[#0d0d0d] p-6 md:p-8">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-[#262626] pb-5">
        <div>
          <div className="font-machined text-[11px] tracking-[2px] uppercase text-[#999999]">
            Server-Side Gemini Synthesis · Grounded in SQLite Evidence
          </div>
          <h3 className="font-display mt-1 text-[28px] tracking-[2px] uppercase text-white">
            AI Forensic Diagnosis &amp; Safe Recovery Advisor
          </h3>
        </div>
        <button
          type="button"
          onClick={() => void handleAnalyze()}
          disabled={loading}
          className="btn-aureon-pill"
        >
          {loading ? 'Synthesizing...' : 'Run AI Diagnosis'}
        </button>
      </div>

      <div className="mt-6 space-y-5">
        <div>
          <label
            htmlFor="ai-forensic-question"
            className="font-machined block text-[10px] tracking-[2px] uppercase text-[#999999]"
          >
            Forensic Inquiry ({dossier.incident.code} · {dossier.order.order_id})
          </label>
          <input
            id="ai-forensic-question"
            type="text"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask a technical question about signature integrity, ordering, or recovery..."
            className="input-aureon"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {PRESET_QUESTIONS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => {
                setQuestion(preset);
                void handleAnalyze(preset);
              }}
              disabled={loading}
              className="font-machined border border-[#262626] px-3 py-1.5 text-left text-[10px] tracking-[1.5px] uppercase text-[#cccccc] transition-colors hover:border-white hover:text-white disabled:opacity-40"
            >
              {preset}
            </button>
          ))}
        </div>

        {error && (
          <div
            role="alert"
            className="border border-[#cf524c] bg-[#141414] p-4 font-machined text-[12px] text-[#cf524c]"
          >
            {error}
          </div>
        )}

        {loading && (
          <div className="space-y-3 border border-[#262626] bg-[#141414] p-6">
            <div className="h-4 w-48 bg-[#1f1f1f]" />
            <div className="h-4 w-full bg-[#1f1f1f]" />
            <div className="h-4 w-5/6 bg-[#1f1f1f]" />
          </div>
        )}

        {!loading && analysis && (
          <div className="grid grid-cols-1 gap-6 border border-[#262626] bg-[#141414] p-6 lg:grid-cols-12">
            <div className="space-y-5 lg:col-span-7">
              <div>
                <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#c3d9f3]">
                  Root-Cause Diagnosis · {analysis.modelUsed}
                </div>
                <p className="font-editorial mt-2 text-[16px] leading-relaxed text-white">
                  {analysis.rootCauseDiagnosis}
                </p>
              </div>

              <div className="border-t border-[#262626] pt-4">
                <div className="font-machined text-[10px] tracking-[2px] uppercase text-[#999999]">
                  Cybersecurity Assessment
                </div>
                <p className="font-editorial mt-2 text-[15px] leading-relaxed text-[#cccccc]">
                  {analysis.securityAssessment}
                </p>
              </div>

              <div className="border-t border-[#262626] pt-4">
                <div className="font-machined mb-2 text-[10px] tracking-[2px] uppercase text-[#999999]">
                  Recommended Safe Recovery Steps
                </div>
                <ul className="space-y-1.5 font-machined text-[11px] text-[#cccccc]">
                  {analysis.recommendedRecoverySteps.map((step, idx) => (
                    <li key={step}>
                      0{idx + 1}. {step}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="lg:col-span-5">
              <div className="font-machined mb-2 text-[10px] tracking-[2px] uppercase text-[#999999]">
                Idempotent Middleware Patch
              </div>
              <pre className="max-h-[260px] overflow-auto border border-[#262626] bg-black p-4 font-machined text-[11px] leading-relaxed text-[#c3d9f3]">
                {analysis.idempotentPatchSnippet}
              </pre>
            </div>
          </div>
        )}

        {!loading && !analysis && !error && (
          <div className="border border-[#262626] bg-black p-6">
            <p className="font-editorial text-[15px] text-[#999999]">
              Click <span className="font-machined text-[11px] tracking-[1.5px] uppercase text-white">Run AI Diagnosis</span> to synthesize a grounded forensic report and idempotent middleware patch from {dossier.order.order_id}&apos;s redacted SQLite logs and HMAC verification results.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
