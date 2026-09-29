import { PageHeader } from '@pymekit/ui/page';

// De-cookied header: the personal `/home` surface is sidebar-only (the
// `layout-style` cookie is deferred), so the sidebar trigger is always shown.
// TODO(migration): drive `displaySidebarTrigger` from the layout style when the
// header layout + `layout-style` cookie port.
export function HomePageHeader(
  props: React.PropsWithChildren<{
    title: React.ReactNode;
    description: React.ReactNode;
  }>,
) {
  return (
    <PageHeader
      title={props.title}
      description={props.description}
      displaySidebarTrigger
    >
      {props.children}
    </PageHeader>
  );
}
