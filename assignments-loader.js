// assignments-loader.js

const housekeeperNames = { A: 'Brian', B: 'Thomas', C: 'Lisa', D: 'Garrett' };
const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function parseCsv(text) {
  if (!text) return [];
  const lines = text.trim().split('\n').filter(line => line.trim() !== '');
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

  let scheduleText = '', oneTimeText = '';
  try {
    const scheduleResp = await fetch(scheduleFilename);
    if (!scheduleResp.ok) throw new Error(`File not found: ${scheduleFilename}`);
    scheduleText = await scheduleResp.text();

    const oneTimeResp = await fetch(oneTimeTaskFile);
    if (!oneTimeResp.ok) throw new Error(`File not found: ${oneTimeTaskFile}`);
    oneTimeText = await oneTimeResp.text();
  } catch (err) {
    assignmentsDiv.innerHTML = `<p style="color:red;">Error loading files: ${err.message}</p>`;
    return;
  }

  const scheduleData = parseCsv(scheduleText);
  const oneTimeTasks = parseCsv(oneTimeText);

  const apiKey = '5b9a10e2092947d49dac84004ad149a2';
  const formId = '250955404825056';
  const roomFieldId = '18';

  const submissions = await fetch(`https://api.jotform.com/form/${formId}/submissions?apiKey=${apiKey}&limit=1000`)
    .then(res => res.json()).then(json => json.content || []);

  const resetTimes = {}, validSubmissions = {};
  for (const sub of submissions) {
    const createdAt = new Date(sub.created_at);
    const raw = sub.answers?.[roomFieldId]?.answer?.trim() || '';
    const room = raw.replace(/reset/i, '').trim();
    if (!room || createdAt < monday || createdAt > sunday) continue;

    if (/reset/i.test(raw)) {
      if (!resetTimes[room] || createdAt > resetTimes[room]) resetTimes[room] = createdAt;
    } else {
      if (!validSubmissions[room] || createdAt > validSubmissions[room].date) {
        validSubmissions[room] = { date: createdAt, raw };
      }
    }
  }

  const statusMap = {};
  for (const room in validSubmissions) {
    const subDate = validSubmissions[room].date;
    if (!resetTimes[room] || subDate > resetTimes[room]) {
      statusMap[room] = { completed: true, date: subDate };
    }
  }

  const resetRooms = new Set();
  for (const room in resetTimes) {
    if (!statusMap[room]) resetRooms.add(room);
  }

  const getName = initial => housekeeperNames[initial] || initial;
  const grouped = {};
  for (const item of scheduleData) {
    const day = item.Day;
    const hkInitial = item.Housekeeper;
    const room = item['Room Name'];
    const link = item.FormLink;
    if (!day || !hkInitial || !room) continue;

    const hkName = getName(hkInitial);
    if (!grouped[hkName]) grouped[hkName] = {};
    if (!grouped[hkName][day]) grouped[hkName][day] = [];
    grouped[hkName][day].push({ room, link });
  }

  const oneTimeGrouped = {};
  for (const task of oneTimeTasks) {
    const hkName = getName(task.Housekeeper);
    if (!oneTimeGrouped[hkName]) oneTimeGrouped[hkName] = [];
    oneTimeGrouped[hkName].push(task);
  }

  const allHousekeepers = new Set([...Object.keys(grouped), ...Object.keys(oneTimeGrouped)]);
  let html = '', total = 0, completed = 0;

  allHousekeepers.forEach(hk => {
    html += `<div class="housekeeper-section"><h2>${hk}</h2>`;

    const days = grouped[hk] || {};
    weekdayOrder.forEach(day => {
      if (days[day]?.length) {
        html += `<h3>${day}</h3><ul>`;
        days[day].forEach(({ room, link }) => {
          total++;
          let cls = '', extra = '', name = room;
          const isComplete = statusMap[room];
          const isReturned = resetRooms.has(room);

          if (isComplete) {
            completed++;
            cls = 'completed';
            extra = ` - ${isComplete.date.toLocaleString()}`;
          } else if (isReturned) {
            cls = 'returned';
            extra = ' - Returned to Schedule';
          } else {
            cls = 'pending';
          }

          if (link) {
            html += `<li class="${cls}"><a href="${link}" target="_blank">${room}</a>${extra}</li>`;
          } else {
            html += `<li class="${cls}">${room}${extra}</li>`;
          }
        });
        html += '</ul>';
      }
    });

    const tasks = oneTimeGrouped[hk] || [];
    if (tasks.length > 0) {
      html += `<h3>Additional Tasks</h3><h4>Please complete this week, click the link to complete</h4><ul>`;
      tasks.forEach(task => {
        const room = task['Room Name'];
        const link = task['FormLink'] || `https://form.jotform.com/${formId}?space=${encodeURIComponent(room)}`;
        total++;
        let cls = '', extra = '';
        if (statusMap[room]) {
          completed++;
          cls = 'completed';
          extra = ` - ${statusMap[room].date.toLocaleString()}`;
        } else {
          cls = 'pending';
        }
        html += `<li class="${cls}"><a href="${link}" target="_blank">${room}</a>${extra}</li>`;
      });
      html += '</ul>';
    }
    html += '</div>';
  });

  if (completed === total && total > 0) {
    assignmentsDiv.innerHTML = `<p class="no-pending">All rooms and tasks are completed this week!</p>`;
  } else {
    assignmentsDiv.innerHTML = html;
  }

  const percent = total > 0 ? Math.round((completed / total) * 100) : 100;
  progressBar.style.width = percent + '%';
  progressBar.textContent = percent + '%';
}

window.onload = () => {
  load().catch(err => {
    document.getElementById('assignments').innerHTML = `<p style="color:red;">Error loading assignments: ${err.message}</p>`;
    console.error(err);
  });
};
