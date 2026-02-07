export type TimeCategory = 'deep_focus' | 'work' | 'social' | 'entertainment' | 'sleep'

export type TimeUsageEntry = {
  start: string
  end: string
  category: TimeCategory
  label: string
}

export type TimeUsageDay = {
  date: string
  entries: TimeUsageEntry[]
}

export type TimeUsageDataset = {
  timezone: string
  days: TimeUsageDay[]
}

export const demoDataset: TimeUsageDataset = {
  timezone: 'Asia/Tokyo',
  days: [
    {
      date: '2026-02-05',
      entries: [
        { start: '2026-02-05T07:30:00+09:00', end: '2026-02-05T09:30:00+09:00', category: 'deep_focus', label: 'Deep focus (project)' },
        { start: '2026-02-05T09:30:00+09:00', end: '2026-02-05T12:00:00+09:00', category: 'work', label: 'Meetings + tasks' },
        { start: '2026-02-05T12:00:00+09:00', end: '2026-02-05T13:00:00+09:00', category: 'social', label: 'Lunch + chat' },
        { start: '2026-02-05T13:00:00+09:00', end: '2026-02-05T16:00:00+09:00', category: 'work', label: 'Coding' },
        { start: '2026-02-05T21:30:00+09:00', end: '2026-02-06T00:10:00+09:00', category: 'entertainment', label: 'Screen time (videos)' },
        { start: '2026-02-06T00:15:00+09:00', end: '2026-02-06T07:10:00+09:00', category: 'sleep', label: 'Sleep' },
      ],
    },
    {
      date: '2026-02-06',
      entries: [
        { start: '2026-02-06T08:00:00+09:00', end: '2026-02-06T10:00:00+09:00', category: 'deep_focus', label: 'Deep focus (study)' },
        { start: '2026-02-06T10:00:00+09:00', end: '2026-02-06T12:30:00+09:00', category: 'work', label: 'Work blocks' },
        { start: '2026-02-06T13:00:00+09:00', end: '2026-02-06T15:30:00+09:00', category: 'work', label: 'Implementation' },
        { start: '2026-02-06T16:00:00+09:00', end: '2026-02-06T17:00:00+09:00', category: 'social', label: 'Messages' },
        { start: '2026-02-06T22:10:00+09:00', end: '2026-02-07T00:40:00+09:00', category: 'entertainment', label: 'Screen time (games)' },
        { start: '2026-02-07T00:50:00+09:00', end: '2026-02-07T07:20:00+09:00', category: 'sleep', label: 'Sleep' },
      ],
    },
  ],
}

