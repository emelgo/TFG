import { Container, Section } from 'react-email';

export function EmailHeader(props: React.PropsWithChildren) {
  return (
    <Container>
      <Section>{props.children}</Section>
    </Container>
  );
}
