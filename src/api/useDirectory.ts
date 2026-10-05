import { useState } from 'react'

export function useDirectory() {
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState<string>()
  const [page, setPage] = useState(1)
  const limit = 20
  const parameters = new URLSearchParams({ search, limit: String(limit), offset: String((page - 1) * limit) })
  if (status) parameters.set('status', status)
  return { search, status, parameters,
    searchFor: (value: string) => { setSearch(value); setPage(1) },
    statusFor: (value?: string) => { setStatus(value); setPage(1) },
    pagination: (total?: number) => ({ current: page, pageSize: limit, total, showSizeChanger: false,
      showTotal: (value: number) => `共 ${value} 条`, onChange: setPage }),
  }
}

