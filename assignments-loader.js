// assignments-loader.js

async function load() {
  const [roomData, jotformData, oneTimeData] = await Promise.all([
    fetch('schedules/Colerain-Week1.csv').then(r => r.text()),
    fetch('https://api.jotform.com/form/250955404825056/submissions?apikey=5b9a10e2092947d49dac84004ad149a2').then(r => r.json()),
    fetch('schedules/colerain-tasks.csv').then(r => r.text()),
  ]);

  const jotformSubmissions = jotformData.content || [];

  const parseCSV = str =>
    str
      .trim()
      .split('\n')
      .slice(1)
      .map(line => {
        const [room, day, person, link] = line.split(',');
        return {
          room: room.trim(),
          day: day.trim(),
          person: person.trim(),
          link: link?.trim(),
        };
      });

  const parseOneTimeCSV = str =>
    str
      .trim()
      .split('\n')
      .slice(1)
      .map(line => {
        const [room, person, link] = line.split(',');
        return {
          'Room Name': room.trim(),
          'Assigned To': person.trim(),
          link: link?.trim(),
        };
      });

  const tasks = parseCSV(roomData);
  const oneTimeTasks = parseOneTimeCSV(oneTimeData);
  const statusMap = {};

  const prevMonday = (() => {
    const d = new Date();
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    d.setHours(0, 0, 0, 0);
    return d;
  })();

  jotformSubmissions.forEach(sub => {
    const room = sub.answers?.['18']?.answer;
    const dateStr = sub.created_at;
    if (room && dateStr && new Date(dateStr) >= prevMonday) {
      statusMap[room.trim()] = true;
    }
  });

  const grouped = {};
  const oneTimeGrouped = {};

  tasks.forEach(({ room, day, person, link }) => {
    if (!grouped[person]) grouped[person] = {};
    if (!grouped[person][day]) grouped[person][day] = [];
    grouped[person][day].push({ room, link });
  });

  oneTimeTasks.forEach(task => {
    const person = task['Assigned To'];
    if (!oneTimeGrouped[person]) oneTimeGrouped[person] = [];
    oneTimeGrouped[person].push(task);
  });

  const weekdayOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
  const allHousekeepers = [...new Set([...Object.keys(grouped), ...Object.keys(oneTimeGrouped)])];

  let html = '';
  allHousekeepers.forEach(hk => {
    const days = grouped[hk] || {};
    const tasks = oneTimeGrouped[hk] || [];

    let hkTotal = 0,
      hkCompleted = 0;

    weekdayOrder.forEach(day => {
      if (days[day]?.length) {
        days[day].forEach(({ room }) => {
          hkTotal++;
          if (statusMap[room]) hkCompleted++;
        });
      }
    });

    tasks.forEach(task => {
      const room = task['Room Name'];
      hkTotal++;
      if (statusMap[room]) hkCompleted++;
    });

    const hkRemaining = hkTotal - hkCompleted;
    html += `<div class="housekeeper-section"><h2>${hk} (${hkRemaining} remaining)</h2>`;

    weekdayOrder.forEach(day => {
      const items = days[day];
      if (items?.length) {
        html += `<h3>${day}</h3><ul>`;
        items.forEach(({ room, link }) => {
          const done = statusMap[room];
          const cls = done ? 'done' : 'not-done';
          const display = link ? `<a href="${link}" target="_blank">${room}</a>` : room;
          html += `<li class="${cls}">${display}</li>`;
        });
        html += '</ul>';
      }
    });

    if (tasks.length) {
      html += `<h3>Additional Rooms</h3><ul>`;
      tasks.forEach(({ 'Room Name': room, link }) => {
        const done = statusMap[room];
        const cls = done ? 'done' : 'not-done';
        const display = link ? `<a href="${link}" target="_blank">${room}</a>` : room;
        html += `<li class="${cls}">${display}</li>`;
      });
      html += '</ul>';
    }

    html += '</div>';
  });

  document.getElementById('assignments').innerHTML = html;
}

load();
