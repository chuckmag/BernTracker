interface ChartTooltipLine {
  text: string
  accent?: boolean
}

interface ChartTooltipProps {
  date: string
  lines: ChartTooltipLine[]
}

export default function ChartTooltip({ date, lines }: ChartTooltipProps) {
  return (
    <div className="bg-white dark:bg-gray-900 border border-slate-200 dark:border-gray-700 rounded-md shadow-md text-xs px-3 py-2 space-y-0.5 max-w-[180px]">
      <p className="text-slate-500 dark:text-gray-400 mb-1">{date}</p>
      {lines.map((line, i) => (
        <p
          key={i}
          className={line.accent
            ? 'text-primary font-medium'
            : 'text-slate-700 dark:text-gray-300'}
        >
          {line.text}
        </p>
      ))}
    </div>
  )
}
