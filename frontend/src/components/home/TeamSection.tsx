import { TEAM_IDENTITY, TEAM_MEMBERS, TEAM_SECTION } from '../../constants/homeContent';
import { teamPortrait } from '../../constants/homeMedia';
import TarsLogo from '../common/TarsLogo';
import { UserIcon } from '../common/icons';
import { sortTeamMembers } from '../../utils/teamMembers';
import HomePanel from './HomePanel';
import styles from './TeamSection.module.css';

function TeamSection() {
  const { id, title, paragraphs } = TEAM_SECTION;
  const members = sortTeamMembers(TEAM_MEMBERS);

  return (
    <HomePanel id={id} title={title}>
      <div className={styles.team}>
        <TarsLogo className={styles.mark} alt="" />
        <div className={styles.teamCopy}>
          <h3 className={styles.teamName}>
            {TEAM_IDENTITY.name} — {TEAM_IDENTITY.expansion}
          </h3>
          {paragraphs.map((paragraph) => (
            <p key={paragraph} className={styles.intro}>
              {paragraph}
            </p>
          ))}
        </div>
      </div>
      {members.length > 0 ? (
        <ul className={styles.members}>
          {members.map((member) => {
            const photo = teamPortrait(member.id);
            return (
              <li key={member.id} className={styles.member}>
                <div className={styles.identity}>
                  <h3 className={styles.name}>
                    {member.href ? (
                      <a href={member.href} target="_blank" rel="noopener noreferrer" className={styles.profile}>
                        {member.name}
                        <span className="visually-hidden"> (opens in a new tab)</span>
                      </a>
                    ) : (
                      member.name
                    )}
                  </h3>
                  <p className={styles.description}>{member.description}</p>
                </div>
                {photo ? (
                  <span className={styles.portraitFrame}>
                    <img src={photo} alt="" className={styles.portrait} />
                  </span>
                ) : (
                  <span className={styles.avatar} aria-hidden="true">
                    <UserIcon width={32} height={32} />
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : (
        <p className={styles.empty}>Team members will appear here once their names are added.</p>
      )}
    </HomePanel>
  );
}

export default TeamSection;
