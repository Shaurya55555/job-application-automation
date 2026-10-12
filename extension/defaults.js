// Shared field definitions. `patterns` are matched (in order, first field wins)
// against the normalized label/name/placeholder text of each form control.
// Values left "" are not filled until you set them in the popup.
const FIELD_DEFS = [
  { key: "firstName", label: "First name", value: "Shaurya", patterns: ["first name", "given name", "forename"] },
  { key: "lastName", label: "Last name", value: "Bajpai", patterns: ["last name", "surname", "family name"] },
  { key: "email", label: "Email", value: "bajpaishaurya2911@gmail.com", patterns: ["e-?mail"] },
  { key: "phone", label: "Phone", value: "7985200306", patterns: ["phone", "mobile", "contact (no|number)", "whats ?app", "telephone"] },
  { key: "linkedin", label: "LinkedIn URL", value: "https://www.linkedin.com/in/shaurya-bajpai/", patterns: ["linkedin"] },
  { key: "github", label: "GitHub URL", value: "https://github.com/Shaurya55555", patterns: ["github"] },
  { key: "leetcode", label: "LeetCode URL", value: "https://leetcode.com/u/shaurya55555/", patterns: ["leetcode", "coding profile", "hackerrank", "codeforces"] },
  { key: "portfolio", label: "Portfolio URL", value: "https://shaurya-bajpai.vercel.app", patterns: ["portfolio", "personal (web)?site", "website", "other link"] },
  { key: "college", label: "College", value: "LNM Institute of Information Technology", patterns: ["college", "university", "institute", "school name", "institution"] },
  { key: "degree", label: "Degree", value: "B.Tech", patterns: ["degree", "qualification", "course"] },
  { key: "branch", label: "Branch / Major", value: "Computer Science and Engineering", patterns: ["field of study", "branch", "major", "specialization", "stream", "discipline"] },
  { key: "gradYear", label: "Graduation year", value: "2027", patterns: ["graduation (year|date)", "passing year", "year of (graduation|passing)", "batch"] },
  { key: "eduFrom", label: "Education start (YYYY-MM)", value: "2023-08", patterns: ["^$never"] },
  { key: "eduTo", label: "Education end (YYYY-MM)", value: "2027-08", patterns: ["^$never"] },
  { key: "skills", label: "Skills (comma separated, max 14 typed)", value: "JavaScript, TypeScript, Python, C++, SQL, React.js, Next.js, Node.js, Express.js, GraphQL, PostgreSQL, MongoDB, Docker, Git", patterns: ["^$never"] },
  { key: "cgpa", label: "CGPA", value: "8.1", patterns: ["cgpa", "gpa", "percentage", "aggregate"] },
  { key: "currentCompany", label: "Current company", value: "Marine Edge", patterns: ["current (company|employer|organi[sz]ation)", "company name", "employer"] },
  { key: "currentTitle", label: "Current title", value: "SDE Intern", patterns: ["current (title|role|designation)", "job title", "designation"] },
  { key: "experience", label: "Years of experience", value: "", patterns: ["years? of (work )?experience", "total experience", "experience \\(years\\)"] },
  { key: "noticePeriod", label: "Notice period", value: "Immediately available", patterns: ["notice period", "joining (time|date)", "available (from|to join)"] },
  { key: "currentCtc", label: "Current CTC", value: "", patterns: ["current (ctc|salary|compensation)"] },
  { key: "stipend", label: "Expected stipend / month (INR)", value: "40000-50000", patterns: ["stipend"] },
  { key: "expectedCtc", label: "Expected CTC (INR / year)", value: "1000000-1200000", patterns: ["expected (ctc|salary|compensation)", "salary expectation", "ctc", "lpa", "compensation"] },
  { key: "dob", label: "Date of birth (YYYY-MM-DD)", value: "2004-11-29", patterns: ["date of birth", "birth ?date", "\\bdob\\b", "birthday"] },
  { key: "city", label: "Current city", value: "Bengaluru", patterns: ["current (city|location)", "city", "location", "where are you based"] },
  { key: "state", label: "State", value: "Karnataka", patterns: ["^state", "province"] },
  { key: "country", label: "Country", value: "India", patterns: ["country", "nationality", "citizenship"] },
  { key: "gender", label: "Gender", value: "Male", patterns: ["gender", "sex"] },
  { key: "name", label: "Full name", value: "Shaurya Bajpai", patterns: ["^(full |your |candidate |applicant )?name\\b", "^name$"] }
];

// Yes/No style answers applied to radio / checkbox / select questions.
const BOOLEAN_DEFS = [
  { patterns: ["relocat"], answer: "Yes" },
  { patterns: ["work authori[sz]ation", "legally (authori[sz]ed|eligible)", "eligible to work"], answer: "Yes" },
  { patterns: ["sponsorship"], answer: "No" },
  { patterns: ["agree", "consent", "declaration", "terms", "privacy", "i confirm", "certify"], answer: "Yes", checkbox: true }
];
