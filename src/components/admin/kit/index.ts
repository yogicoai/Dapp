/**
 * 관리자 페이지 부품 한곳 — 화면은 늘 `@/components/admin/kit` 에서만 가져온다.
 *
 * 옛 관리실 부품(ui.tsx: Card·Button·Stat·NumberField·Chip·Empty·when)도 여기서 다시 내보낸다 —
 * 옮겨 온 화면이 쓰던 이름 그대로 쓰게. 단 T(색 표)는 tokens.ts 것 하나만 내보낸다
 * (ui.tsx 에도 T 가 있어 둘 다 내보내면 이름이 겹친다. tokens.ts 의 T 는 옛 값을 모두 품는다).
 */
export { T, BADGE_TONE, type BadgeTone } from "./tokens";
export { Icon, type IconName } from "./Icon";
export { Card, CardTitle, Button, Stat, NumberField, Chip, Empty, when } from "../ui";
export {
  AdminLink,
  PageHeader,
  SectionTabs,
  StatCard,
  Badge,
  StatusBadge,
  Banner,
  EmptyState,
  ErrorState,
  Skeleton,
  PageSkeleton,
  KeyValue,
  CopyButton,
  Won,
  TimeText,
} from "./display";
export { DataTable, type Column } from "./table";
export { FilterBar, SearchInput, ChipGroup, PeriodSelect } from "./filters";
export { Drawer, Modal, ModalActions, ConfirmDialog } from "./overlay";
export { Field, TextInput, TextArea, Switch, SaveBar } from "./form";
export {
  useAdminQuery,
  useTabParam,
  useMineParam,
  useUrlDrawer,
  useUrlOverlay,
  type AdminQuery,
} from "./hooks";
