// assignments-loader.js

const housekeeperNames = { A: 'Brian', B: 'Thomas', C: 'Lisa', D: 'Garrett' };
const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseCsv(text) {
  if (!text) return [];
  const lines = text.trim().split('\n').filter(line => line.trim() !== '');

  // Detect delimiter: tab or comma
  const delimiter = lines[0].includes('\t') ? '\t' : ',';

  const headers = lines[0].split(delimiter).map(h => h.trim().replace(/^"|"$/g, ''));
  return lines.slice(1).map(line => {
    const values = line.split(delimiter).map(v => v.trim().replace(/^"|"$/g, ''));
    const obj = {};
    headers.forEach((h, i) => obj[h] = values[i] || '');
    return obj;
  });
}

function getMonday(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = (day === 0 ? -6 : 1) - day;
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}

function getWeekOfMonth(mondayDate) {
  const year = mondayDate.getFullYear();
  const month = mondayDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  let mondayCount = 0;
  let current = new Date(firstOfMonth);
  while (current <= mondayDate) {
    if (current.getDay() === 1) mondayCount++;
    current.setDate(current.getDate() + 1);
  }
  return mondayCount;
}

async function load() {
  const assignmentsDiv = document.getElementById('assignments');
  const progressBar = document.getElementById('progress');
  const scheduleNameDiv = document.getElementById('scheduleName');

  const monday = getMonday();
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const weekNumber = getWeekOfMonth(monday);
  const scheduleFilename = `schedules/Colerain-Week${weekNumber}.csv`;
  const oneTimeTaskFile = `schedules/colerain-tasks.csv`;
  scheduleNameDiv.textContent = `Schedule: Colerain-Week${weekNumber}`;

  // Load regular schedule CSV
  let scheduleText = '';
  try {
    const response = await fetch(scheduleFilename);
    if (!response.ok) throw new Error(`File not found: ${scheduleFilename}`);
    scheduleText = await response.text();
  } catch (err) {
    assignmentsDiv.innerHTML = `<p style="color:red;">Could not load schedule file: ${err.message}</p>`;
    return;
  }

  // Load one-time tasks CSV
  let oneTimeText = '';
  try {
    const response = await fetch(oneTimeTaskFile);
    if (!response.ok) throw new Error(`File not found: ${oneTimeTaskFile}`);
    oneTimeText = await response.text();
  } catch (err) {
    console.warn('Could not load one-time tasks file:', err.message);
  }

  const scheduleData = parseCsv(scheduleText);
  const oneTimeTasks = parseCsv(oneTimeText);

  // JotForm API settings
  const apiKey = '5b9a10e2092947d49dac84004ad149a2';
  const formId = '250955404825056';
  const roomFieldId = '18';

  // Fetch submissions
  let submissionsData = [];
  try {
    const res = await fetch(`https://api.jotform.com/form/${formId}/submissions?apiKey=${apiKey}&limit=1000`);
    const json = await res.json();
    submissionsData = json.content || [];
  } catch (err) {
    console.warn('Failed to fetch submissions:', err.message);
  }

  const resetTimes = {};
  const validSubmissions = {};
  for (const sub of submissionsData) {
    const createdAt = new Date(sub.created_at);
    const roomRaw = sub.answers?.[roomFieldId]?.answer?.trim() || '';
    const roomName = roomRaw.replace(/reset/i, '').trim();
    if (!roomName) continue;

    if (createdAt < monday || createdAt > sunday) continue;

    if (/reset/i.test(roomRaw)) {
      if (!resetTimes[roomName] || createdAt > resetTimes[roomName]) {
        resetTimes[roomName] = createdAt;
      }
    } else {
      if (!validSubmissions[roomName] || createdAt > validSubmissions[roomName].date) {
        validSubmissions[roomName] = { date: createdAt, raw: roomRaw };
      }
    }
  }

  const statusMap = {};
  for (const room in validSubmissions) {
    const submissionDate = validSubmissions[room].date;
    if (!resetTimes[room] || submissionDate > resetTimes[room]) {
      statusMap[room] = { completed: true, date: submissionDate };
    }
  }

  const resetRooms = new Set();
  for (const room in resetTimes) {
    if (!statusMap[room]) {
      resetRooms.add(room);
    }
  }

  const getName = initial => housekeeperNames[initial] || initial;

  // Group schedule by housekeeper and day
  const grouped = {};
  for (const item of scheduleData) {
    const day = item.Day;
    const hkInitial = item.Housekeeper;
    const room = item['Room Name'];
    if (!day || !hkInitial || !room) continue;

    const hkName = getName(hkInitial);
    if (!grouped[hkName]) grouped[hkName] = {};
    if (!grouped[hkName][day]) grouped[hkName][day] = [];
    grouped[hkName][day].push({
      room,
      link: item.FormLink || ''
    });
  }

  // Group one-time tasks by housekeeper
  const oneTimeGrouped = {};
  for (const task of oneTimeTasks) {
    const hkName = getName(task.Housekeeper);
    if (!oneTimeGrouped[hkName]) oneTimeGrouped[hkName] = [];
    oneTimeGrouped[hkName].push(task);
  }

  // Combine housekeepers from both sources
  const allHousekeepers = new Set([
    ...Object.keys(grouped),
    ...Object.keys(oneTimeGrouped)
  ]);

  let html = '';
  let totalRooms = 0, completedRooms = 0;

  allHousekeepers.forEach(hkName => {
    html += `<section class="housekeeper-section"><h2>${hkName}</h2>`;

    const days = grouped[hkName] || {};
    weekdayOrder.forEach(day => {
      if (days[day]?.length) {
        html += `<h3>${day}</h3><ul>`;
        days[day].forEach(({ room, link }) => {
          totalRooms++;
          let cls = '', extra = '', roomDisplay = room;

          if (link && link.trim() !== '') {
            roomDisplay = `<a href="${link}" target="_blank" rel="noopener noreferrer">${room}</a>`;
          }

          if (statusMap[room]) {
            completedRooms++;
            cls = 'completed';
            extra = ` - ${statusMap[room].date.toLocaleString()}`;
          } else if (resetRooms.has(room)) {
            cls = 'returned';
            extra = ' - Returned to Schedule';
          } else {
            cls = 'pending';
          }

          html += `<li class="${cls}">${roomDisplay}${extra}</li>`;
        });
        html += '</ul>';
      }
    });

    // One-time tasks / Additional Tasks under same housekeeper
    const tasks = oneTimeGrouped[hkName] || [];
    if (tasks.length > 0) {
      html += `<h3>Additional Tasks</h3><p style="font-size: 0.9rem; margin-left: 2rem; margin-top: -0.5rem; margin-bottom: 0.5rem; color:#555;">
        Please complete this week, click the link to complete
      </p><ul>`;
      tasks.forEach(task => {
        const room = task['Room Name'];
        const link = task['FormLink'] || `https://form.jotform.com/${formId}?space=${encodeURIComponent(room)}`;
        totalRooms++;
        let cls = '', extra = '';

        if (statusMap[room]) {
          completedRooms++;
          cls = 'completed';
          extra = ` - ${statusMap[room].date.toLocaleString()}`;
        } else {
          cls = 'pending';
        }

        html += `<li class="${cls}"><a href="${link}" target="_blank" rel="noopener noreferrer">${room}</a>${extra}</li>`;
      });
      html += '</ul>';
    }

    html += `</section>`;
  });

  if (completedRooms === totalRooms && totalRooms > 0) {
    assignmentsDiv.innerHTML = `<p class="no-pending">All rooms and tasks are completed this week!</p>`;
  } else {
    assignmentsDiv.innerHTML = html;
  }

  const percent = totalRooms > 0 ? Math.round((completedRooms / totalRooms) * 100) : 100;
  progressBar.style.width = percent + '%';
  progressBar.textContent = percent + '%';
}

load().catch(err => {
  const assignmentsDiv = document.getElementById('assignments');
  assignmentsDiv.innerHTML = `<p style="color:red;">Error loading assignments: ${err.message}</p>`;
  console.error(err);
});

setInterval(() => location.reload(), 300000); // Auto-refresh every 5 minutes
