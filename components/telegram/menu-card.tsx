import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  type MenuSection,
  menuSections,
  sectionMeta,
  type SectionStatus,
} from "@/lib/features/telegram/constants";

type MenuCardProps = {
  activeSection: MenuSection;
  sectionStatus: Record<MenuSection, SectionStatus>;
  readySectionsCount: number;
  completionPercent: number;
  firstPendingSection: MenuSection | null;
  onGoToSection: (section: MenuSection) => void;
};

export function MenuCard({
  activeSection,
  sectionStatus,
  readySectionsCount,
  completionPercent,
  firstPendingSection,
  onGoToSection,
}: MenuCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Меню</CardTitle>
        <CardDescription>Быстрые переходы и подсказки по каждому разделу.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs text-[var(--tg-theme-hint-color)]">
          Готовность: {readySectionsCount}/{menuSections.length} блоков готовы к действию.
        </p>
        <div className="space-y-2">
          <div className="h-2 rounded-full bg-[var(--tg-theme-bg-color)]">
            <div
              className="h-full rounded-full bg-[var(--tg-theme-button-color)] transition-all"
              style={{ width: `${completionPercent}%` }}
            />
          </div>
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="text-[var(--tg-theme-hint-color)]">Прогресс: {completionPercent}%</span>
            {firstPendingSection ? (
              <Button
                variant="outline"
                className="min-h-8 px-2 text-xs"
                onClick={() => onGoToSection(firstPendingSection)}
              >
                Следующий шаг: {sectionMeta[firstPendingSection].label}
              </Button>
            ) : (
              <span className="font-medium text-emerald-500 dark:text-emerald-400">Все блоки готовы</span>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2">
          {menuSections.map((section) => {
            const status = sectionStatus[section];

            return (
              <Button
                key={section}
                variant={activeSection === section ? "default" : "secondary"}
                aria-pressed={activeSection === section}
                onClick={() => onGoToSection(section)}
                className="h-auto w-full flex-col items-start gap-1 px-3 py-2 text-left"
              >
                <span className="leading-tight">{sectionMeta[section].label}</span>
                <span
                  className={
                    status.ready
                      ? "text-xs font-medium text-emerald-500 dark:text-emerald-400"
                      : "text-xs text-[var(--tg-theme-hint-color)]"
                  }
                >
                  {status.note}
                </span>
              </Button>
            );
          })}
        </div>
        <p className="rounded-xl bg-[var(--tg-theme-bg-color)] p-3 text-sm text-[var(--tg-theme-hint-color)]">
          Подсказка: {sectionMeta[activeSection].hint}
        </p>
      </CardContent>
    </Card>
  );
}
