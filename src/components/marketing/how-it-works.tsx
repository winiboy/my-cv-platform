interface Step {
  title: string
  description: string
}

interface HowItWorksProps {
  steps: Step[]
}

export function HowItWorks({ steps }: HowItWorksProps) {
  return (
    <div className="mx-auto max-w-5xl">
      <div className="grid gap-8 md:grid-cols-3">
        {steps.map((step, index) => (
          <div key={index} className="relative">
            {/* Step number */}
            <div className="mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-teal-500 to-teal-600 shadow-lg">
              <span className="text-3xl font-bold text-white">{index + 1}</span>
            </div>

            {/* Connecting line (hidden on last item and mobile) */}
            {index < steps.length - 1 && (
              <div className="absolute left-8 top-8 hidden h-0.5 w-full bg-gradient-to-r from-teal-200 to-transparent md:block" />
            )}

            {/* Content */}
            <div className="relative">
              <h3 className="mb-3 text-xl font-bold text-slate-900">{step.title}</h3>
              <p className="text-slate-600 leading-relaxed">{step.description}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
