import { TEAM_MEMBERS, TEAM_SECTION } from '../../constants/homeContent';
import { teamPortrait } from '../../constants/homeMedia';
import { memberInitials, sortTeamMembers } from '../../utils/teamMembers';
import HomePanel from './HomePanel';
import styles from './TeamSection.module.css';

function TeamSection() {
  const { id, title, paragraphs } = TEAM_SECTION;
  const members = sortTeamMembers(TEAM_MEMBERS);

  return (
    <HomePanel id={id} title={title}>
      {paragraphs.map((paragraph) => (
        <p key={paragraph} className={styles.intro}>
          {paragraph}
        </p>
      ))}
      {members.length > 0 ? (
        <ul className={styles.members}>
          {members.map((member) => {
            const photo = teamPortrait(member.id);
            return (
              <li key={member.id} className={styles.member}>
                <div className={styles.identity}>
                  <h3 className={styles.name}>{member.name}</h3>
                  <p className={styles.description}>{member.description}</p>
                </div>
                {photo ? (
                  <img src={photo} alt="" className={styles.portrait} />
                ) : (
                  <span className={styles.initials} aria-hidden="true">
                    {memberInitials(member.name)}
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
