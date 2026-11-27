import React, { useState } from 'react';
import { Check, Copy, Mail, Phone, ShieldCheck, Users } from 'lucide-react';

interface TeamMember {
  id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  photoSrc: string;
  ringClassName: string;
  photoClassName: string;
  contributions: string;
}

const TEAM_MEMBERS: TeamMember[] = [
  {
    id: 'seif',
    name: 'Seif Eldin Montaser',
    role: 'Lead Researcher / CTO · Head of Feasibility & Partnerships',
    email: 'seifeldin.1725041@stemismailia.moe.edu.eg',
    phone: '+201153179651',
    photoSrc: '/assets/team/seif_eldin_montaser.png',
    ringClassName: 'border-2 border-cyan-400/80',
    photoClassName: 'w-full h-full object-cover object-center scale-[1.06]',
    contributions:
      'Project direction, desalination plant brine feasibility, techno-economic strategy, and industrial partnership coordination.',
  },
  {
    id: 'mohamed',
    name: 'Mohamed Mohamed Sadat',
    role: 'Project Lead / CEO · Designer & ML Developer',
    email: 'mohamed.1725029@stemismailia.moe.edu.eg',
    phone: '+201270016303',
    photoSrc: '/assets/aistudio/cap_babaacc3.jpeg',
    ringClassName: 'border-2 border-emerald-300/80',
    photoClassName: 'w-full h-full object-cover object-[50%_15%]',
    contributions:
      '8-ion Nernst–Planck PINN architecture, 2D multiphysics solver integration, Pitzer + CNT pipeline, and ML ablation validation.',
  },
];

export const TeamAndIpSection: React.FC = () => {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (key: string, value: string) => {
    navigator.clipboard?.writeText(value);
    setCopiedKey(key);
    setTimeout(() => {
      setCopiedKey((prev) => (prev === key ? null : prev));
    }, 1500);
  };

  return (
    <section className="border border-[#1C2536] bg-[#0E131D] rounded overflow-hidden">
      <div className="px-5 py-3 bg-[#131A27] border-b border-[#1C2536] flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-cyan-400" />
          <h2 className="text-sm font-semibold text-slate-100">
            Research Team, Official Contact &amp; Intellectual Property
          </h2>
        </div>
        <span className="text-xs font-mono text-slate-400">
          Verified Authors · © 2026 REDMind
        </span>
      </div>

      <div className="p-5 space-y-5">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {TEAM_MEMBERS.map((member) => {
            const emailKey = `${member.id}-email`;
            const phoneKey = `${member.id}-phone`;
            return (
              <article
                key={member.id}
                className="border border-[#1C2536] bg-[#080B11] rounded p-5 flex flex-col justify-between gap-4"
              >
                <div className="flex flex-col items-center text-center gap-3.5">
                  <div
                    className={`w-[124px] h-[164px] rounded-[999px] overflow-hidden bg-[#0E131D] shrink-0 ${member.ringClassName}`}
                  >
                    <img
                      src={member.photoSrc}
                      alt={member.name}
                      className={member.photoClassName}
                    />
                  </div>

                  <div className="space-y-1">
                    <h3 className="text-base font-semibold text-slate-50">
                      {member.name}
                    </h3>
                    <div className="text-xs font-mono text-cyan-400">
                      {member.role}
                    </div>
                  </div>

                  <p className="text-xs text-slate-400 leading-relaxed max-w-md">
                    {member.contributions}
                  </p>
                </div>

                <div className="pt-3 border-t border-[#1C2536] space-y-2 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`mailto:${member.email}`}
                      className="inline-flex items-center gap-2 text-slate-200 hover:text-cyan-300 transition-colors min-w-0 truncate"
                    >
                      <Mail className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
                      <span className="font-mono text-[11px] truncate">
                        {member.email}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(emailKey, member.email)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-[11px] text-slate-300 shrink-0 cursor-pointer"
                      title="Copy official email"
                    >
                      {copiedKey === emailKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <a
                      href={`tel:${member.phone}`}
                      className="inline-flex items-center gap-2 text-slate-200 hover:text-cyan-300 transition-colors"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="font-mono text-[11px] tabular-nums">
                        {member.phone}
                      </span>
                    </a>
                    <button
                      type="button"
                      onClick={() => handleCopy(phoneKey, member.phone)}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded border border-[#2C3A52] bg-[#0E131D] hover:bg-[#131A27] text-[11px] text-slate-300 shrink-0 cursor-pointer"
                      title="Copy phone number"
                    >
                      {copiedKey === phoneKey ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-400" />
                          <span className="text-emerald-400">Copied</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          <span>Copy</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>

        {/* Intellectual Property & Authorship Notice */}
        <div className="border border-[#2C3A52] bg-[#131A27]/60 rounded p-4 flex items-start gap-3">
          <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <div className="space-y-1 text-xs leading-relaxed">
            <div className="font-semibold text-slate-100">
              Intellectual Property &amp; Authorship Attribution — © 2026 REDMind. All Rights Reserved.
            </div>
            <p className="text-slate-300">
              Original research, simulation software, 2D 8-ion Nernst–Planck–Donnan–GHK finite-volume solver, USGS Pitzer + Wenzel CNT scaling evaluator, 275-case 18D Sobol physics corpus, and Fourier-SiLU Physics-Informed Neural Network (PINN) architecture authored and owned by{' '}
              <span className="text-slate-100 font-medium">Seif Eldin Montaser</span> and{' '}
              <span className="text-slate-100 font-medium">Mohamed Mohamed Sadat</span>. Any reproduction, redistribution, or derivative academic/commercial evaluation must retain author attribution and official contact records.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
