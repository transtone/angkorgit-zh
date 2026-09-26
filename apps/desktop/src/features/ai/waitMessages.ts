import { useEffect, useState } from 'react';

export const REVIEW_WAIT_MESSAGES = [
  '正在读取更改…',
  '正在思考边界情况…',
  '正在查找缺陷…',
  '正在检查你的约定…',
  '正在查找缺失的测试…',
  '正在润色反馈…',
];

export const EXPLAIN_WAIT_MESSAGES = [
  '正在读取更改…',
  '正在梳理逻辑…',
  '正在辨别移动的代码…',
  '正在组织成通俗的文字…',
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
