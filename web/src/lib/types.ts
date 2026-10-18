export type Member = {
  id: string;
  name: string;
  email: string;
  color: string;
  last_login_at?: string | null;
};

export type Me = Member & { must_change_pin: boolean; feed_seen_at: string };

export type AccountKind = "checking" | "savings" | "credit" | "loan" | "cash";

export type Account = {
  id: string;
  name: string;
  kind: AccountKind;
  institution: string | null;
  holder: string | null;
  apr: number | null;
  promo_end: string | null;
  promo_apr: number | null;
  plan_payment: number | null;
  min_payment: number | null;
  starting_balance: number | null;
  sort: number;
  archived: boolean;
};

export type Balance = {
  id: string;
  account_id: string;
  amount: number;
  as_of: string;
  created_by: string | null;
  source: "manual" | "statement" | "claude";
  note: string | null;
  created_at: string;
};

export type CategoryKind = "bill" | "spending" | "debt" | "income" | "other" | "business";

export type Category = {
  id: string;
  name: string;
  grp: string;
  kind: CategoryKind;
  monthly_plan: number;
  due_day: number | null;
  icon: string | null;
  sort: number;
  archived: boolean;
};

export type EntryKind = "expense" | "income" | "transfer" | "refund";

export type Entry = {
  id: string;
  kind: EntryKind;
  occurred_on: string;
  amount: number;
  title: string;
  category_id: string | null;
  account_id: string | null;
  to_account_id: string | null;
  one_time: boolean;
  note: string | null;
  created_by: string | null;
  source: "manual" | "statement" | "email" | "claude";
  verified: boolean;
  verified_ref: string | null;
  verified_at: string | null;
  flagged: boolean;
  created_at: string;
  updated_at: string;
  updated_by: string | null;
  comment_count?: number;
};

export type Comment = {
  id: string;
  entry_id: string;
  author_id: string | null;
  body: string;
  created_at: string;
};

export type Checkin = {
  id: string;
  period: string;
  title: string;
  body: string;
  stats: Record<string, unknown>;
  created_at: string;
};

export type Settings = {
  pay_anchor?: string;
  pay_every_days?: number;
  typical_check?: number;
  cushion_target?: number;
};

export type AppState = {
  me: Me;
  members: Member[];
  accounts: Account[];
  balances: Balance[];
  categories: Category[];
  settings: Settings;
  checkins: Checkin[];
  unread: { entries: string[]; comment_entries: string[]; comments: number };
};
