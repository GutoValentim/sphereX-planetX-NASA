import Reveal from '../components/common/Reveal';
import ExplorerSection from '../components/home/ExplorerSection';
import HeroSection from '../components/home/HeroSection';
import SpherexSection from '../components/home/SpherexSection';
import TeamSection from '../components/home/TeamSection';
import PageContainer from '../components/layout/PageContainer';
import styles from './Home.module.css';

function Home() {
  return (
    <PageContainer width="full">
      <HeroSection />
      <div className={styles.stack}>
        <Reveal>
          <SpherexSection />
        </Reveal>
        <Reveal>
          <ExplorerSection />
        </Reveal>
        <Reveal>
          <TeamSection />
        </Reveal>
      </div>
    </PageContainer>
  );
}

export default Home;
