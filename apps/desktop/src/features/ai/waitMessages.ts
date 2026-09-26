import { useEffect, useState } from 'react';

export const REVIEW_WAIT_MESSAGES = [
  'Reading the changes…',
  '正在思考边界情况…',
  '正在查找缺陷…',
  '正在检查你的约定…',
  '正在查找缺失的测试…',
  '正在润色反馈…',
];

export const EXPLAIN_WAIT_MESSAGES = [
  'Reading the changes…',
  'Following the logic…',
  'Working out what moved and why…',
  'Putting it in plain words…',
];

const WAIT_MESSAGE_INTERVAL = 6000;

export function useWaitMessage(busy: boolean, messages: readonly string[]): { key: number; text: string } {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    if (!busy) return;
    setIndex(Math.floor(Math.random() * messages.length));
    const timer = setInterval(() => setIndex((i) => i + 1), WAIT_MESSAGE_INTERVAL);
    return () => clearInterval(timer);
  }, [busy, messages.length]);
  return { key: index, text: messages[index % messages.length] ?? '' };
}
