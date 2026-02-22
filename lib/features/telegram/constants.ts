export type MenuSection = "session" | "ai" | "memory" | "storage";

export type SectionStatus = {
  ready: boolean;
  note: string;
};

export type MatchPreview = {
  id: string;
  similarity: number;
};

export type MemoryItem = {
  id: string;
  content: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type ValidateResponse = {
  telegramId: string;
  telegramUser: {
    first_name: string;
    username?: string;
  };
};

export type AiStreamChunk =
  | {
      type: "meta";
      matches: MatchPreview[];
    }
  | {
      type: "text-delta";
      delta: string;
    }
  | {
      type: "done";
      text: string;
    }
  | {
      type: "error";
      error: string;
    };

export const menuSections: MenuSection[] = ["session", "ai", "memory", "storage"];

export const sectionMeta: Record<MenuSection, { label: string; hint: string }> = {
  session: {
    label: "Профиль",
    hint: "Проверь, что сессия Telegram подтверждена. Без этого защищённые API не будут работать.",
  },
  ai: {
    label: "Вопрос к ИИ",
    hint: "Задай вопрос. Ответ строится с учётом сохранённой памяти из pgvector.",
  },
  memory: {
    label: "Память",
    hint: "Сохрани заметку в векторную память. Потом ИИ сможет использовать её в ответах.",
  },
  storage: {
    label: "Файлы",
    hint: "Создай подписанный URL для загрузки файла в Supabase Storage в папку текущего пользователя.",
  },
};

export const AI_PROMPT_MAX_LENGTH = 4000;
export const AI_PROMPT_SOFT_LIMIT = 3400;
export const aiPromptPresets = [
  "Собери короткий план задач на день на основе моей памяти.",
  "Что из сохранённых заметок сейчас наиболее приоритетно?",
  "Сформулируй 3 следующих шага по текущему проекту.",
];

export const MEMORY_INPUT_MAX_LENGTH = 12_000;
export const MEMORY_INPUT_SOFT_LIMIT = 10_000;
export const memoryPromptPresets = [
  "Клиент просит отчёт по статусу проекта к пятнице.",
  "Нужно подготовить список рисков и план действий.",
  "Согласовать ТЗ, дедлайн и ответственных по задачам.",
];

export const FILE_NAME_MAX_LENGTH = 120;
export const FILE_NAME_SOFT_LIMIT = 100;
export const fileNamePresets = ["notes.txt", "task-plan.md", "report-2026-02-21.txt"];
