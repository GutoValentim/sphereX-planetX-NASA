import ButtonLink from '../components/common/ButtonLink';
import EmptyState from '../components/common/EmptyState';
import PageContainer from '../components/layout/PageContainer';
import { ROUTES } from '../routes/paths';

function NotFound() {
  return (
    <PageContainer backTo={ROUTES.home}>
      <EmptyState
        titleAs="h1"
        title="Page not found"
        message="The page you are looking for does not exist."
        action={
          <ButtonLink to={ROUTES.home} variant="secondary">
            Back to Home
          </ButtonLink>
        }
      />
    </PageContainer>
  );
}

export default NotFound;
