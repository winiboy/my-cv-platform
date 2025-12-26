import Link from 'next/link'
import { Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'

interface PricingPlan {
  name: string
  price: string
  period: string
  features: string[]
  cta: string
  badge?: string
  highlighted?: boolean
}

interface PricingTableProps {
  plans: PricingPlan[]
  locale: string
}

export function PricingTable({ plans, locale }: PricingTableProps) {
  return (
    <div className="grid gap-8 lg:grid-cols-2">
      {plans.map((plan, index) => (
        <div
          key={index}
          className={`relative rounded-2xl border p-8 shadow-sm transition-all hover:shadow-md ${
            plan.highlighted
              ? 'border-teal-500 bg-teal-50/50 ring-2 ring-teal-500/20'
              : 'border-slate-200 bg-white'
          }`}
        >
          {plan.badge && (
            <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-teal-500">
              {plan.badge}
            </Badge>
          )}

          <div className="mb-8">
            <h3 className="text-2xl font-bold text-slate-900">{plan.name}</h3>
            <div className="mt-4 flex items-baseline gap-2">
              <span className="text-5xl font-bold text-slate-900">{plan.price}</span>
              <span className="text-slate-600">/ {plan.period}</span>
            </div>
          </div>

          <ul className="mb-8 space-y-4">
            {plan.features.map((feature, featureIndex) => (
              <li key={featureIndex} className="flex items-start gap-3">
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-teal-100">
                  <Check className="h-4 w-4 text-teal-600" />
                </div>
                <span className="text-slate-700">{feature}</span>
              </li>
            ))}
          </ul>

          <Button
            asChild
            className={`w-full ${
              plan.highlighted
                ? 'bg-teal-500 hover:bg-teal-600'
                : 'bg-slate-900 hover:bg-slate-800'
            }`}
          >
            <Link href={`/${locale}/signup`}>{plan.cta}</Link>
          </Button>
        </div>
      ))}
    </div>
  )
}
