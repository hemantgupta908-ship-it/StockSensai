import type { Metadata } from "next";

import { CalendarView } from "@/components/budget/calendar-view";
import { BudgetHeader, BudgetPage } from "@/components/budget/budget-ui";

export const metadata: Metadata = {
  title: "Calendar View",
  description: "Monthly calendar view of your daily transactions.",
};

export default function CalendarPage() {
  return (
    <>
      {/*
        `fluid` rather than `wide`: this screen is a grid beside a side panel, and
        a 1180px cap left a few hundred pixels of gutter either side on a desktop
        display. Header and page must carry the same width or the title stops
        lining up with the content.
      */}
      <BudgetHeader title="Calendar" backHref="/budget" width="fluid" />
      <BudgetPage width="fluid">
        <CalendarView />
      </BudgetPage>
    </>
  );
}
