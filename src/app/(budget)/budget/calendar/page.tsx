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
      <BudgetHeader title="Calendar" backHref="/budget" />
      <BudgetPage>
        <CalendarView />
      </BudgetPage>
    </>
  );
}
