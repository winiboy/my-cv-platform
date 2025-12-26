'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

interface FAQ {
  question: string
  answer: string
}

interface FAQAccordionProps {
  faqs: FAQ[]
}

export function FAQAccordion({ faqs }: FAQAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(0) // First item open by default

  const toggleItem = (index: number) => {
    setOpenIndex(openIndex === index ? null : index)
  }

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      {faqs.map((faq, index) => (
        <div
          key={index}
          className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md"
        >
          <button
            onClick={() => toggleItem(index)}
            className="flex w-full items-center justify-between gap-4 px-6 py-5 text-left transition-colors hover:bg-slate-50"
            aria-expanded={openIndex === index}
          >
            <span className="text-lg font-semibold text-slate-900">
              {faq.question}
            </span>
            <ChevronDown
              className={`h-5 w-5 shrink-0 text-slate-600 transition-transform ${
                openIndex === index ? 'rotate-180' : ''
              }`}
            />
          </button>
          <div
            className={`overflow-hidden transition-all ${
              openIndex === index ? 'max-h-96' : 'max-h-0'
            }`}
          >
            <div className="border-t border-slate-100 px-6 py-5">
              <p className="text-slate-700 leading-relaxed">{faq.answer}</p>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
