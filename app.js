document.addEventListener("DOMContentLoaded", () => {

  // ---------------- STATE ----------------
  let currentWorkout = null;
  let currentExercise = null;
  let currentSection = "home";
  let timerInterval = null;
  let remainingSeconds = 90; // default timer

  const quotes = [
    "Push yourself because no one else is going to do it for you.",
    "The body achieves what the mind believes.",
    "Strength does not come from the body, it comes from the will.",
    "Sweat is fat crying."
  ];

  // ---------------- UTILITIES ----------------
  function showPage(pageId) {
    document.querySelectorAll("body > div").forEach(d => d.classList.add("hidden"));
    const page = document.getElementById(pageId);
    if (page) page.classList.remove("hidden");
  }

  function randomQuote() {
    return quotes[Math.floor(Math.random() * quotes.length)];
  }

  // ---------------- BACK BUTTON ----------------
  document.addEventListener("click", e => {
    if (!e.target.classList.contains("back-btn")) return;

    switch (currentSection) {
      case "view-workouts":
        showPage("home-page");
        currentSection = "home";
        break;
      case "view-exercises":
        loadWorkouts();
        currentSection = "view-workouts";
        break;
      case "start-workout":
        showPage("home-page");
        currentSection = "home";
        break;
      case "workout-exercises":
        loadStartWorkout();
        currentSection = "start-workout";
        break;
      case "exercise-detail":
        loadWorkoutExercises(currentWorkout);
        currentSection = "workout-exercises";
        break;
    }
  });

  // ---------------- HOME ----------------
  document.getElementById("view-workouts-btn").onclick = () => {
    currentSection = "view-workouts";
    loadWorkouts();
  };

  document.getElementById("start-workout-btn").onclick = () => {
    currentSection = "start-workout";
    loadStartWorkout();
  };

  document.getElementById("quote-home").textContent = randomQuote();

  // ---------------- VIEW WORKOUTS ----------------
  async function loadWorkouts() {
    showPage("view-workouts-page");
    document.getElementById("quote-view").textContent = randomQuote();

    const { data } = await supabase.from("workouts").select("*").order("created_at", { ascending: true });
    const list = document.getElementById("workouts-list");
    list.innerHTML = "";

    data.forEach(workout => {
      const div = document.createElement("div");
      div.className = "p-3 rounded flex justify-between items-center cursor-pointer";
      div.style.backgroundColor = "#E6E6FA"; // lavender card
      div.onclick = () => loadExercises(workout);

      const nameSpan = document.createElement("span");
      nameSpan.textContent = workout.name;
      nameSpan.className = "flex-1 font-semibold text-gray-800";
      div.appendChild(nameSpan);

      // Edit button
      const editBtn = document.createElement("button");
      editBtn.textContent = "✏️";
      editBtn.className = "btn-border text-yellow-500 ml-2 text-sm";
      editBtn.style.borderColor = "#FFD700";
      editBtn.onclick = async (e) => {
        e.stopPropagation();
        const newName = prompt("Edit workout name", workout.name);
        if (!newName) return;
        await supabase.from("workouts").update({ name: newName }).eq("id", workout.id);
        loadWorkouts();
      };
      div.appendChild(editBtn);

      // Delete button
      const delBtn = document.createElement("button");
      delBtn.textContent = "🗑️";
      delBtn.className = "btn-border text-red-400 ml-2 text-sm";
      delBtn.style.borderColor = "#FF7F7F"; // pastel coral
      delBtn.onclick = async (e) => {
        e.stopPropagation();
        if (!confirm("Delete this workout?")) return;
        await supabase.from("workouts").delete().eq("id", workout.id);
        loadWorkouts();
      };
      div.appendChild(delBtn);

      list.appendChild(div);
    });
  }

  document.getElementById("create-workout-btn").onclick = () => {
    document.getElementById("create-workout-modal").classList.remove("hidden");
    document.getElementById("modal-workout-name").value = "";
    document.getElementById("modal-workout-name").focus();
  };

  document.getElementById("modal-workout-cancel-btn").onclick = () => {
    document.getElementById("create-workout-modal").classList.add("hidden");
  };

  document.getElementById("modal-workout-save-btn").onclick = async () => {
    const name = document.getElementById("modal-workout-name").value.trim();

    if (!name) {
      alert("Please enter a workout name");
      return;
    }

    await supabase.from("workouts").insert({ name });
    document.getElementById("create-workout-modal").classList.add("hidden");
    loadWorkouts();
  };

  /* VIEW EXERCISES (READ ONLY + PB) */
async function loadExercises(workout) {
  currentWorkout = workout;
  currentSection = "view-exercises";
  showPage("view-exercises-page");

  document.getElementById("selected-workout-title").textContent = workout.name;
  const list = document.getElementById("exercises-list");
  list.innerHTML = "";

  const { data: exercises } = await supabase
    .from("exercises")
    .select("*")
    .eq("workout_id", workout.id);

  for (const ex of exercises) {
    const { data: sets } = await supabase
      .from("sets")
      .select("*")
      .eq("exercise_id", ex.id);

    let best = 0, label = "—";
    sets.forEach(s => {
      const score = s.weight * s.reps;
      if (score > best) {
        best = score;
        label = `${s.weight}kg × ${s.reps}`;
      }
    });

    const div = document.createElement("div");
    div.className = "card p-3 flex justify-between";
    const warmupText = ex.has_warmup ? "✓ Warmup" : "—";
    div.innerHTML = `
      <div>
        <div><span>${ex.name}</span></div>
        <div class="text-sm text-gray-600">${ex.num_sets || 4} sets | ${warmupText}</div>
      </div>
      <strong>PB: ${label}</strong>
    `;
    list.appendChild(div);
  }
}

  document.getElementById("add-exercise-btn").onclick = () => {
    document.getElementById("add-exercise-modal").classList.remove("hidden");
    document.getElementById("modal-exercise-name").value = "";
    document.getElementById("modal-sets-count").value = "4";
    document.getElementById("modal-warmup-check").checked = false;
    document.getElementById("modal-exercise-name").focus();
  };

  document.getElementById("modal-cancel-btn").onclick = () => {
    document.getElementById("add-exercise-modal").classList.add("hidden");
  };

  document.getElementById("modal-save-btn").onclick = async () => {
    const name = document.getElementById("modal-exercise-name").value.trim();
    const numSets = parseInt(document.getElementById("modal-sets-count").value) || 4;
    const hasWarmup = document.getElementById("modal-warmup-check").checked;

    if (!name) {
      alert("Please enter an exercise name");
      return;
    }

    await supabase.from("exercises").insert({ 
      name, 
      workout_id: currentWorkout.id,
      num_sets: numSets,
      has_warmup: hasWarmup
    });

    document.getElementById("add-exercise-modal").classList.add("hidden");
    loadExercises(currentWorkout);
  };

  // ---------------- START WORKOUT ----------------
  async function loadStartWorkout() {
    currentSection = "start-workout";
    showPage("start-workout-page");
    document.getElementById("quote-start").textContent = randomQuote();
    document.getElementById("start-workout-title").textContent = "Select Workout";

    const { data: workouts } = await supabase.from("workouts").select("*");
    const list = document.getElementById("start-workout-list");
    list.innerHTML = "";

    workouts.forEach(workout => {
      const div = document.createElement("div");
      div.className = "p-3 rounded cursor-pointer";
      div.style.backgroundColor = "#E6E6FA"; // lavender
      div.textContent = workout.name;
      div.onclick = () => startWorkoutSession(workout);
      list.appendChild(div);
    });

    document.getElementById("finish-workout-btn").classList.add("hidden");
  }

  function startWorkoutSession(workout) {
    currentWorkout = { ...workout, session_id: crypto.randomUUID() };
    loadWorkoutExercises(currentWorkout);
  }

  async function loadWorkoutExercises(workout) {
    currentSection = "workout-exercises";
    showPage("start-workout-page");
    document.getElementById("start-workout-title").textContent = "Select Exercise";

    const { data: exercises } = await supabase
      .from("exercises")
      .select("*")
      .eq("workout_id", workout.id);

    const list = document.getElementById("start-workout-list");
    list.innerHTML = "";

    for (const ex of exercises) {
      // Check if this exercise has sets in the current session
      const { data: sessionSets } = await supabase
        .from("sets")
        .select("*")
        .eq("exercise_id", ex.id)
        .eq("session_id", workout.session_id);

      const isCompleted = sessionSets && sessionSets.length > 0;

      const div = document.createElement("div");
      div.className = "p-3 rounded cursor-pointer flex justify-between items-center";
      div.style.backgroundColor = "#FFEFD5"; // soft peach
      
      const nameSpan = document.createElement("span");
      nameSpan.textContent = ex.name;
      div.appendChild(nameSpan);

      if (isCompleted) {
        const checkmark = document.createElement("span");
        checkmark.textContent = "✓";
        checkmark.style.color = "#4CAF50";
        checkmark.style.fontSize = "1.5em";
        checkmark.style.fontWeight = "bold";
        div.appendChild(checkmark);
      }

      div.onclick = () => openExerciseDetail(ex);
      list.appendChild(div);
    }

    if (exercises && exercises.length > 0) {
      document.getElementById("finish-workout-btn").classList.remove("hidden");
    } else {
      document.getElementById("finish-workout-btn").classList.add("hidden");
    }
  }

  // ---------------- EXERCISE DETAIL ----------------
  async function openExerciseDetail(ex) {
    currentExercise = ex;
    currentSection = "exercise-detail";

    showPage("exercise-detail-page");
    document.getElementById("exercise-title").textContent = ex.name;
    document.getElementById("quote-exercise").textContent = randomQuote();

    const setsContainer = document.getElementById("sets-container");
    setsContainer.innerHTML = "";

    const numSets = ex.num_sets || 4;
    const hasWarmup = ex.has_warmup || false;

    const { data: lastSets } = await supabase
      .from("sets")
      .select("*")
      .eq("exercise_id", ex.id)
      .order("created_at", { ascending: false })
      .limit(numSets + (hasWarmup ? 1 : 0));

    const { data: lastNote, error } = await supabase
      .from("exercise_notes")
      .select("note, created_at")
      .eq("exercise_id", ex.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) console.error(error);
    document.getElementById("exercise-note").value = lastNote ? lastNote.note : "";

    const headerDiv = document.createElement("div");
    headerDiv.className = "flex items-center gap-2 mb-2 font-semibold text-gray-700";
    headerDiv.innerHTML = `
      <span class="w-20"></span>
      <div class="w-16 text-center">Reps</div>
      <div class="w-16 text-center">Kg</div>
      <div class="flex-1 text-right">Previous</div>
    `;
    setsContainer.appendChild(headerDiv);

    const totalSets = (hasWarmup ? 1 : 0) + numSets;
    for (let i = 0; i < totalSets; i++) {
      const lastSet = lastSets.find(s => s.sets === i);
      const prevText = lastSet ? `${lastSet.reps} × ${lastSet.weight}kg` : '-';

      const div = document.createElement("div");
      div.className = "flex items-center gap-2 mb-1";
      const setLabel = (hasWarmup && i === 0) ? "Warm-up" : `Set ${i - (hasWarmup ? 1 : 0) + 1}`;
      div.innerHTML = `
        <span class="font-bold w-20">${setLabel}:</span>
        <input type="number" placeholder="Reps" class="w-16 p-1 text-center">
        <input type="number" placeholder="Kg" class="w-16 p-1 text-center">
        <div class="flex-1 text-right text-gray-500 text-sm">${prevText}</div>
      `;
      setsContainer.appendChild(div);
    }

    // ---------------- REST TIMER ----------------
let timerInterval = null;

const timerInput = document.getElementById("timer-input");
const timerDisplay = document.getElementById("timer-display");
const startTimerBtn = document.getElementById("start-timer-btn");
const resetTimerBtn = document.getElementById("reset-timer-btn");

function formatTime(sec) {
  const m = Math.floor(sec / 60).toString().padStart(2, "0");
  const s = (sec % 60).toString().padStart(2, "0");
  return `${m}:${s}`;
}

startTimerBtn.onclick = () => {
  let remaining = parseInt(timerInput.value);
  if (isNaN(remaining) || remaining <= 0) return;

  timerDisplay.textContent = formatTime(remaining);

  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    remaining--;
    timerDisplay.textContent = formatTime(remaining);

    if (remaining <= 0) {
      clearInterval(timerInterval);
      timerDisplay.textContent = "00:00";
    }
  }, 1000);
};

resetTimerBtn.onclick = () => {
  clearInterval(timerInterval);
  const v = parseInt(timerInput.value);
  timerDisplay.textContent = isNaN(v) ? "00:00" : formatTime(v);
};

    // ---------------- SAVE NOTE + SETS ----------------
    document.getElementById("save-exercise-note").onclick = async () => {
      if (!currentExercise || !currentWorkout || !currentWorkout.session_id) return;

      const setsDivs = Array.from(setsContainer.children).slice(1);
      const noteValue = document.getElementById("exercise-note").value;

      for (let i = 0; i < setsDivs.length; i++) {
        const inputs = setsDivs[i].querySelectorAll("input");
        const reps = parseInt(inputs[0].value) || 0;
        const weight = parseFloat(inputs[1].value) || 0;

        if (reps > 0 || weight > 0) {
          await supabase.from("sets").insert({
            exercise_id: currentExercise.id,
            workout_id: currentWorkout.id,
            session_id: currentWorkout.session_id,
            sets: i,
            reps,
            weight
          });
        }
      }

      if (noteValue.trim() !== "") {
        await supabase.from("exercise_notes").insert({
          exercise_id: currentExercise.id,
          note: noteValue
        });
      }

      loadWorkoutExercises(currentWorkout);
      currentSection = "workout-exercises";
    };
  }

  // ---------------- FINISH WORKOUT ----------------
  document.getElementById("finish-workout-btn").onclick = async () => {
    if (!currentWorkout || !currentWorkout.session_id) return;

    const { data: sessionSets, error: sessionError } = await supabase
      .from("sets")
      .select("*")
      .eq("session_id", currentWorkout.session_id);

    if (sessionError) {
      alert("Error fetching session sets.");
      return;
    }

    if (!sessionSets || sessionSets.length === 0) {
      alert("Workout finished!\nNo sets logged, so no PBs today.");
      return;
    }

    const setsByExercise = {};
    sessionSets.forEach(s => {
      if (!setsByExercise[s.exercise_id]) setsByExercise[s.exercise_id] = [];
      setsByExercise[s.exercise_id].push(s);
    });

    const pbExercises = [];

    for (const exerciseId in setsByExercise) {
      const todaysSets = setsByExercise[exerciseId];

      const { data: previousSets } = await supabase
        .from("sets")
        .select("*")
        .eq("exercise_id", exerciseId)
        .neq("session_id", currentWorkout.session_id);

      let isPB = false;

      if (!previousSets || previousSets.length === 0) {
        isPB = true;
      } else {
        for (const set of todaysSets) {
          const setScore = set.weight * set.reps;
          const beatsAnyPrevious = previousSets.some(prev => {
            const prevScore = prev.weight * prev.reps;
            return setScore > prevScore;
          });
          if (beatsAnyPrevious) {
            isPB = true;
            break;
          }
        }
      }

      if (isPB) pbExercises.push(exerciseId);
    }

    // Build array of PB exercise names (if any) and show modal instead of alert
    let pbNames = [];
    if (pbExercises.length > 0) {
      const { data: names } = await supabase
        .from("exercises")
        .select("id, name")
        .in("id", pbExercises);
      pbNames = names ? names.map(n => n.name) : [];
    }

    showFinishModal(pbNames, sessionSets);
  };

  // Show a friendly modal summarising the workout finish and PBs
  function showFinishModal(pbNames, sessionSets) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = 0;
    overlay.style.top = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.45)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = 9999;

    const modal = document.createElement("div");
    modal.style.width = "min(520px, 92%)";
    modal.style.background = "#fff";
    modal.style.borderRadius = "10px";
    modal.style.boxShadow = "0 8px 30px rgba(0,0,0,0.2)";
    modal.style.padding = "20px";
    modal.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

    const title = document.createElement("h3");
    title.textContent = "Workout finished!";
    title.style.margin = "0 0 8px 0";
    title.style.fontSize = "1.1rem";
    title.style.color = "#333";
    modal.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.style.margin = "0 0 12px 0";
    subtitle.style.color = "#555";
    if (!pbNames || pbNames.length === 0) {
      subtitle.textContent = "No PBs today — good effort, keep going!";
    } else {
      subtitle.textContent = `PBs today: ${pbNames.length}`;
    }
    modal.appendChild(subtitle);

    if (pbNames && pbNames.length > 0) {
      const list = document.createElement("ul");
      list.style.margin = "0 0 16px 0";
      list.style.paddingLeft = "1.2rem";
      pbNames.forEach(n => {
        const li = document.createElement("li");
        li.textContent = n;
        li.style.marginBottom = "6px";
        list.appendChild(li);
      });
      modal.appendChild(list);
    }

    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "flex-end";
    btnRow.style.gap = "8px";

    const review = document.createElement("button");
    review.textContent = "Review session";
    review.className = "btn-border";
    review.style.padding = "8px 12px";
    review.style.borderRadius = "6px";
    review.style.border = "1px solid #2b6cb0";
    review.style.background = "#2b6cb0";
    review.style.color = "#fff";
    review.onclick = async () => {
      document.body.removeChild(overlay);
      await showSessionSummary(sessionSets, pbNames);
    };
    btnRow.appendChild(review);

    const ok = document.createElement("button");
    ok.textContent = "OK";
    ok.className = "btn-border";
    ok.style.padding = "8px 12px";
    ok.style.borderRadius = "6px";
    ok.style.border = "1px solid #ccc";
    ok.style.background = "#fff";
    ok.onclick = () => {
      document.body.removeChild(overlay);
      currentWorkout = null;
      currentSection = "home";
      showPage("home-page");
    };

    btnRow.appendChild(ok);
    modal.appendChild(btnRow);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    ok.focus();
  }

  // Show a modal summarising the session's sets grouped by exercise
  async function showSessionSummary(sessionSets, pbNames = []) {
    const overlay = document.createElement("div");
    overlay.style.position = "fixed";
    overlay.style.left = 0;
    overlay.style.top = 0;
    overlay.style.width = "100%";
    overlay.style.height = "100%";
    overlay.style.backgroundColor = "rgba(0,0,0,0.5)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = 10000;

    const modal = document.createElement("div");
    modal.style.width = "min(720px, 96%)";
    modal.style.maxHeight = "86vh";
    modal.style.overflow = "auto";
    modal.style.background = "#fff";
    modal.style.borderRadius = "10px";
    modal.style.boxShadow = "0 10px 40px rgba(0,0,0,0.25)";
    modal.style.padding = "18px";
    modal.style.fontFamily = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial";

    const title = document.createElement("h3");
    title.textContent = "Session summary";
    title.style.margin = "0 0 6px 0";
    title.style.color = "#222";
    modal.appendChild(title);

    const subtitle = document.createElement("p");
    subtitle.style.margin = "0 0 12px 0";
    subtitle.style.color = "#444";
    subtitle.textContent = `Logged sets: ${sessionSets.length}` + (pbNames && pbNames.length ? ` · ${pbNames.length} PB(s)` : "");
    modal.appendChild(subtitle);

    // Map exercise IDs -> sets
    const byEx = {};
    sessionSets.forEach(s => {
      const key = String(s.exercise_id);
      if (!byEx[key]) byEx[key] = [];
      byEx[key].push(s);
    });

    // Load exercise names (use string keys so lookups match)
    const exIds = Object.keys(byEx).map(x => x);
    let exMap = {};
    if (exIds.length > 0) {
      try {
        const { data: exs } = await supabase.from("exercises").select("id, name").in("id", exIds);
        if (exs) exs.forEach(e => exMap[String(e.id)] = e.name);
      } catch (err) {
        console.error(err);
      }
    }

    // Sort exercises by name for a clean list
    const sortedExIds = Object.keys(byEx).sort((a, b) => {
      const na = (exMap[a] || a).toString().toLowerCase();
      const nb = (exMap[b] || b).toString().toLowerCase();
      return na.localeCompare(nb);
    });

    sortedExIds.forEach(exId => {
      const name = exMap[exId] || `Exercise ${exId}`;
      const isPB = Array.isArray(pbNames) && pbNames.includes(name);

      const block = document.createElement("div");
      block.style.marginBottom = "12px";
      block.style.padding = "10px";
      block.style.borderRadius = "10px";
      block.style.background = "#fff";
      block.style.boxShadow = "0 4px 12px rgba(0,0,0,0.06)";

      const h = document.createElement("div");
      h.style.display = "flex";
      h.style.justifyContent = "space-between";
      h.style.alignItems = "center";

      const leftTitle = document.createElement("div");
      leftTitle.style.display = "flex";
      leftTitle.style.alignItems = "center";
      leftTitle.style.gap = "8px";

      const exTitle = document.createElement("strong");
      exTitle.textContent = name;
      exTitle.style.fontSize = "1rem";
      leftTitle.appendChild(exTitle);

      if (isPB) {
        const badge = document.createElement("span");
        badge.textContent = "PB";
        badge.style.background = "#D1FAE5";
        badge.style.color = "#065F46";
        badge.style.padding = "4px 8px";
        badge.style.borderRadius = "999px";
        badge.style.fontSize = "0.75rem";
        leftTitle.appendChild(badge);
      }

      h.appendChild(leftTitle);

      const count = document.createElement("span");
      count.style.color = "#666";
      count.textContent = `${byEx[exId].length} set(s)`;
      h.appendChild(count);

      block.appendChild(h);

      const rows = document.createElement("div");
      rows.style.marginTop = "8px";
      byEx[exId].forEach((s, idx) => {
        const r = document.createElement("div");
        r.style.display = "grid";
        r.style.gridTemplateColumns = "1fr 1fr";
        r.style.gap = "8px";
        r.style.alignItems = "center";
        r.style.padding = "8px";
        r.style.borderRadius = "8px";
        r.style.background = "#F7FAFC";
        r.style.marginBottom = "6px";

        const col1 = document.createElement("div");
        col1.textContent = `Set ${idx + 1}`;
        col1.style.fontWeight = 600;
        r.appendChild(col1);

        const col2 = document.createElement("div");
        col2.textContent = `${s.reps || 0} × ${s.weight || 0}kg`;
        col2.style.textAlign = "right";
        r.appendChild(col2);

        rows.appendChild(r);
      });

      block.appendChild(rows);
      modal.appendChild(block);
    });

    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "flex-end";
    row.style.gap = "8px";

    const back = document.createElement("button");
    back.textContent = "Back";
    back.className = "btn-border";
    back.style.padding = "8px 12px";
    back.style.borderRadius = "6px";
    back.onclick = () => {
      document.body.removeChild(overlay);
      showFinishModal(pbNames, sessionSets);
    };

    const close = document.createElement("button");
    close.textContent = "Done";
    close.className = "btn-border";
    close.style.padding = "8px 12px";
    close.style.borderRadius = "6px";
    close.onclick = () => {
      document.body.removeChild(overlay);
      currentWorkout = null;
      currentSection = "home";
      showPage("home-page");
    };

    row.appendChild(back);
    row.appendChild(close);
    modal.appendChild(row);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    close.focus();
  }
});
