document.addEventListener("DOMContentLoaded", () => {

  // ---------------- STATE ----------------
  let currentWorkout = null;
  let currentExercise = null;
  let currentSection = "home";
  let timerInterval = null;
  let remainingSeconds = 30; // default timer
  let workoutsCache = null;
  let previousWorkoutsCache = null;
  let exercisesByWorkoutCache = new Map();
  let setsByWorkoutCache = new Map();
  let lastCompletedByWorkoutCache = null;
  let exercisesLoadRequestId = 0;
  let sessionHasSavedSets = false;

  const quotes = [
    "The hardest part is over. You showed up.",
"You miss one hundred percent of the shots you don’t take.",
"Do something today that your future self will thank you for.",
"You must expect things of yourself before you can do them.",
"We can push ourselves further. We always have more to give.",
"Your mind will quit a thousand times before your body will."
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

  function formatRelativeDateAEST(dateValue) {
    const timeZone = "Australia/Sydney";
    const date = new Date(dateValue);
    if (Number.isNaN(date.getTime())) return "";

    const todayStr = new Intl.DateTimeFormat("en-AU", { timeZone }).format(new Date());
    const dateStr = new Intl.DateTimeFormat("en-AU", { timeZone }).format(date);
    if (dateStr === todayStr) return "Today";

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 1);
    const yStr = new Intl.DateTimeFormat("en-AU", { timeZone }).format(yesterday);
    if (dateStr === yStr) return "Yesterday";

    return new Intl.DateTimeFormat("en-AU", {
      timeZone,
      day: "2-digit",
      month: "short",
      year: "numeric"
    }).format(date);
  }

  function normalizeSetsForPB(sets, hasWarmup) {
    return (sets || []).filter(s => {
      const reps = Number(s.reps) || 0;
      const weight = Number(s.weight) || 0;
      if (reps <= 0 || weight <= 0) return false;
      if (hasWarmup && Number(s.sets) === 0) return false;
      return true;
    });
  }

  function computeBestSet(sets, hasWarmup) {
    const filtered = normalizeSetsForPB(sets, hasWarmup);
    if (filtered.length === 0) return null;
    return filtered.reduce((best, s) => {
      if (!best) return s;
      if (s.weight > best.weight) return s;
      if (s.weight === best.weight && s.reps > best.reps) return s;
      return best;
    }, null);
  }

  function isPBForSession(todaysSets, previousSets, hasWarmup) {
    const today = normalizeSetsForPB(todaysSets, hasWarmup);
    if (today.length === 0) return false;

    const previous = normalizeSetsForPB(previousSets, hasWarmup);
    if (previous.length === 0) return true;

    let prevMaxWeight = 0;
    const maxRepsAtWeight = {};
    previous.forEach(s => {
      if (s.weight > prevMaxWeight) prevMaxWeight = s.weight;
      if (!maxRepsAtWeight[s.weight] || s.reps > maxRepsAtWeight[s.weight]) {
        maxRepsAtWeight[s.weight] = s.reps;
      }
    });

    return today.some(s => {
      if (s.weight > prevMaxWeight) return true;
      const prevReps = maxRepsAtWeight[s.weight];
      return Number.isFinite(prevReps) && s.reps > prevReps;
    });
  }

  function hasUnsavedExerciseInput() {
    const note = document.getElementById("exercise-note");
    const noteHasText = note && note.value.trim() !== "";
    const inputs = Array.from(document.querySelectorAll("#sets-container input"));
    const hasSetValues = inputs.some(input => input.value.trim() !== "");
    return noteHasText || hasSetValues;
  }

  function openBackConfirm({ title, message, confirmText, cancelText }) {
    return new Promise(resolve => {
      const modal = document.getElementById("back-confirm-modal");
      const titleEl = document.getElementById("back-confirm-title");
      const messageEl = document.getElementById("back-confirm-message");
      const okBtn = document.getElementById("back-confirm-ok");
      const cancelBtn = document.getElementById("back-confirm-cancel");

      titleEl.textContent = title || "Go back?";
      messageEl.textContent = message || "";
      okBtn.textContent = confirmText || "Go back";
      cancelBtn.textContent = cancelText || "Stay";

      const close = (result) => {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        resolve(result);
      };

      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onBackdrop = (e) => {
        if (e.target === modal) close(false);
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);

      modal.classList.remove("hidden");
      okBtn.focus();
    });
  }

  // ---------------- BACK BUTTON ----------------
  document.addEventListener("click", async e => {
    if (!e.target.classList.contains("back-btn")) return;

    switch (currentSection) {
      case "view-workouts":
        showPage("home-page");
        currentSection = "home";
        break;
      case "previous-workouts":
        showPage("home-page");
        currentSection = "home";
        break;
      case "view-exercises":
        showPage("view-workouts-page");
        currentSection = "view-workouts";
        break;
      case "start-workout":
        showPage("home-page");
        currentSection = "home";
        break;
      case "workout-exercises":
        if (sessionHasSavedSets) {
          const proceed = await openBackConfirm({
            title: "Leave workout?",
            message: "You have saved sets in this workout. If you go back now, your progress will not be saved.",
            confirmText: "Leave",
            cancelText: "Stay"
          });
          if (!proceed) return;
        }
        loadStartWorkout();
        currentSection = "start-workout";
        break;
      case "exercise-detail":
        if (hasUnsavedExerciseInput()) {
          const proceed = await openBackConfirm({
            title: "Discard changes?",
            message: "You have unsaved reps or notes. Going back will discard them.",
            confirmText: "Go back",
            cancelText: "Stay"
          });
          if (!proceed) return;
        }
        showPage("start-workout-page");
        currentSection = "workout-exercises";
        break;
    }
  });

  // ---------------- HOME ----------------
  document.getElementById("view-workouts-btn").onclick = () => {
    currentSection = "view-workouts";
    loadWorkouts();
  };

  document.getElementById("view-previous-btn").onclick = () => {
    currentSection = "previous-workouts";
    loadPreviousWorkouts();
  };

  document.getElementById("start-workout-btn").onclick = () => {
    currentSection = "start-workout";
    loadStartWorkout();
  };

  document.getElementById("quote-home").textContent = randomQuote();

  // ---------------- VIEW WORKOUTS ----------------
  async function loadWorkouts(options = {}) {
    const { force = false } = options;
    showPage("view-workouts-page");
    document.getElementById("quote-view").textContent = randomQuote();

    if (!force && Array.isArray(workoutsCache)) {
      renderWorkoutsList(workoutsCache);
      refreshWorkoutsInBackground();
      return;
    }

    const { data } = await supabase
      .from("workouts")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });
    workoutsCache = data || [];
    renderWorkoutsList(workoutsCache);
  }

  async function refreshWorkoutsInBackground() {
    try {
      const { data } = await supabase
        .from("workouts")
        .select("id, name, created_at")
        .order("created_at", { ascending: true });
      if (!data) return;
      workoutsCache = data;
      if (currentSection === "view-workouts") {
        renderWorkoutsList(workoutsCache);
        }
    } catch (err) {
      console.error(err);
    }
  }

  function renderWorkoutsList(workouts) {
    const list = document.getElementById("workouts-list");
    list.innerHTML = "";

    (workouts || []).forEach(workout => {
      const div = document.createElement("div");
      div.className = "p-2 rounded flex justify-between items-center cursor-pointer";
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
        workoutsCache = null;
        loadWorkouts({ force: true });
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
        exercisesByWorkoutCache.delete(workout.id);
        setsByWorkoutCache.delete(workout.id);
        workoutsCache = null;
        loadWorkouts({ force: true });
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
    workoutsCache = null;
    document.getElementById("create-workout-modal").classList.add("hidden");
    loadWorkouts({ force: true });
  };

  /* VIEW EXERCISES (READ ONLY + PB) */
async function loadExercises(workout, options = {}) {
  const { force = false } = options;
  const requestId = ++exercisesLoadRequestId;
  currentWorkout = workout;
  currentSection = "view-exercises";
  showPage("view-exercises-page");

  document.getElementById("selected-workout-title").textContent = workout.name;
  const list = document.getElementById("exercises-list");
  list.innerHTML = "";

  let exercises = exercisesByWorkoutCache.get(workout.id);
  const usedExercisesCache = !!exercises && !force;
  if (!exercises || force) {
    const { data } = await supabase
      .from("exercises")
      .select("id, name, num_sets, has_warmup, workout_id")
      .eq("workout_id", workout.id);
    if (requestId !== exercisesLoadRequestId) return;
    exercises = data || [];
    exercisesByWorkoutCache.set(workout.id, exercises);
  }

  let setsByExercise = setsByWorkoutCache.get(workout.id);
  const usedSetsCache = !!setsByExercise && !force;
  if (!setsByExercise || force) {
    const exerciseIds = (exercises || []).map(ex => ex.id);
    setsByExercise = {};
    if (exerciseIds.length > 0) {
      const { data: allSets } = await supabase
        .from("sets")
        .select("exercise_id, reps, weight, sets")
        .in("exercise_id", exerciseIds);
      if (requestId !== exercisesLoadRequestId) return;
      (allSets || []).forEach(s => {
        if (!setsByExercise[s.exercise_id]) setsByExercise[s.exercise_id] = [];
        setsByExercise[s.exercise_id].push(s);
      });
    }
    setsByWorkoutCache.set(workout.id, setsByExercise);
  }

  if (requestId !== exercisesLoadRequestId) return;

  (exercises || []).forEach(ex => {
    const sets = setsByExercise[ex.id] || [];
    const bestSet = computeBestSet(sets, ex.has_warmup);
    const label = bestSet ? `${bestSet.weight}kg × ${bestSet.reps}` : "—";

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
  });
}

  async function refreshExercisesInBackground(workoutId) {
    try {
      const { data: exercises } = await supabase
        .from("exercises")
        .select("id, name, num_sets, has_warmup, workout_id")
        .eq("workout_id", workoutId);
      const exerciseIds = (exercises || []).map(ex => ex.id);
      let setsByExercise = {};
      if (exerciseIds.length > 0) {
        const { data: allSets } = await supabase
          .from("sets")
          .select("exercise_id, reps, weight")
          .in("exercise_id", exerciseIds);
        (allSets || []).forEach(s => {
          if (!setsByExercise[s.exercise_id]) setsByExercise[s.exercise_id] = [];
          setsByExercise[s.exercise_id].push(s);
        });
      }
      exercisesByWorkoutCache.set(workoutId, exercises || []);
      setsByWorkoutCache.set(workoutId, setsByExercise);
    } catch (err) {
      console.error(err);
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
    exercisesByWorkoutCache.delete(currentWorkout.id);
    setsByWorkoutCache.delete(currentWorkout.id);
    loadExercises(currentWorkout, { force: true });
  };

  // ---------------- START WORKOUT ----------------
  async function loadStartWorkout(options = {}) {
    const { force = false } = options;
    currentSection = "start-workout";
    showPage("start-workout-page");
    document.getElementById("quote-start").textContent = randomQuote();
    document.getElementById("start-workout-title").textContent = "Select Workout";

    if (!force && Array.isArray(workoutsCache)) {
      renderStartWorkoutList(workoutsCache, { force });
      refreshWorkoutsInBackground();
      return;
    }

    const { data: workouts } = await supabase
      .from("workouts")
      .select("id, name, created_at")
      .order("created_at", { ascending: true });
    workoutsCache = workouts || [];
    renderStartWorkoutList(workoutsCache, { force });
  }

  async function renderStartWorkoutList(workouts, options = {}) {
    const { force = false } = options;
    const list = document.getElementById("start-workout-list");
    list.innerHTML = "";

    let lastByWorkout = lastCompletedByWorkoutCache;
    if (!lastByWorkout || force) {
      lastByWorkout = {};
      const workoutIds = (workouts || []).map(w => w.id).filter(Boolean);
      if (workoutIds.length > 0) {
        const { data: recentSessions } = await supabase
          .from("workout_sessions")
          .select("workout_id, completed_at")
          .in("workout_id", workoutIds)
          .order("completed_at", { ascending: false });
        (recentSessions || []).forEach(s => {
          if (!lastByWorkout[s.workout_id]) lastByWorkout[s.workout_id] = s.completed_at;
        });
      }
      lastCompletedByWorkoutCache = lastByWorkout;
    }

    (workouts || []).forEach(workout => {
      const div = document.createElement("div");
      div.className = "p-2 rounded cursor-pointer flex justify-between items-center";
      div.style.backgroundColor = "#E6E6FA"; // lavender

      const nameSpan = document.createElement("span");
      nameSpan.textContent = workout.name;
      div.appendChild(nameSpan);

      const lastDate = lastByWorkout[workout.id];
      if (lastDate) {
        const lastSpan = document.createElement("span");
        lastSpan.className = "text-sm text-gray-600";
        lastSpan.textContent = `Last completed: ${formatRelativeDateAEST(lastDate)}`;
        div.appendChild(lastSpan);
      }

      div.onclick = () => startWorkoutSession(workout);
      list.appendChild(div);
    });

    document.getElementById("finish-workout-btn").classList.add("hidden");
  }

  function startWorkoutSession(workout) {
    currentWorkout = { ...workout, session_id: crypto.randomUUID() };
    sessionHasSavedSets = false;
    loadWorkoutExercises(currentWorkout);
  }

  async function loadWorkoutExercises(workout) {
    currentSection = "workout-exercises";
    showPage("start-workout-page");
    document.getElementById("start-workout-title").textContent = "Select Exercise";

    let exercises = exercisesByWorkoutCache.get(workout.id);
    if (!exercises) {
      const { data } = await supabase
        .from("exercises")
        .select("id, name, num_sets, has_warmup, workout_id")
        .eq("workout_id", workout.id);
      exercises = data || [];
      exercisesByWorkoutCache.set(workout.id, exercises);
    }

    const list = document.getElementById("start-workout-list");
    list.innerHTML = "";

    const exerciseIds = (exercises || []).map(ex => ex.id);
    let completedSet = new Set();
    if (exerciseIds.length > 0) {
      const { data: sessionSets } = await supabase
        .from("sets")
        .select("exercise_id")
        .eq("session_id", workout.session_id)
        .in("exercise_id", exerciseIds);
      (sessionSets || []).forEach(s => completedSet.add(s.exercise_id));
    }

    (exercises || []).forEach(ex => {
      const isCompleted = completedSet.has(ex.id);

      const div = document.createElement("div");
      div.className = "p-2 rounded cursor-pointer flex justify-between items-center";
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
    });

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

    const [lastSetsResult, lastNoteResult] = await Promise.all([
      supabase
        .from("sets")
        .select("sets, reps, weight")
        .eq("exercise_id", ex.id)
        .order("created_at", { ascending: false })
        .limit(numSets + (hasWarmup ? 1 : 0)),
      supabase
        .from("exercise_notes")
        .select("note, created_at")
        .eq("exercise_id", ex.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle()
    ]);
    const lastSets = lastSetsResult.data || [];
    const lastNote = lastNoteResult.data || null;
    const error = lastNoteResult.error;

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

      let insertedAny = false;
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
          insertedAny = true;
        }
      }

      if (noteValue.trim() !== "") {
        await supabase.from("exercise_notes").insert({
          exercise_id: currentExercise.id,
          note: noteValue
        });
      }

      if (insertedAny || noteValue.trim() !== "") {
        sessionHasSavedSets = true;
      }

      setsByWorkoutCache.delete(currentWorkout.id);
      lastCompletedByWorkoutCache = null;
      loadWorkoutExercises(currentWorkout);
      currentSection = "workout-exercises";
    };
  }

  function openFinishConfirm() {
    return new Promise(resolve => {
      const modal = document.getElementById("finish-confirm-modal");
      const okBtn = document.getElementById("finish-confirm-ok");
      const cancelBtn = document.getElementById("finish-confirm-cancel");

      const close = (result) => {
        modal.classList.add("hidden");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        modal.removeEventListener("click", onBackdrop);
        resolve(result);
      };

      const onOk = () => close(true);
      const onCancel = () => close(false);
      const onBackdrop = (e) => {
        if (e.target === modal) close(false);
      };

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      modal.addEventListener("click", onBackdrop);

      modal.classList.remove("hidden");
      okBtn.focus();
    });
  }

  // ---------------- FINISH WORKOUT ----------------
  document.getElementById("finish-workout-btn").onclick = async () => {
    if (!currentWorkout || !currentWorkout.session_id) return;
    const confirmed = await openFinishConfirm();
    if (!confirmed) return;

    await supabase.from("workout_sessions").insert({
      session_id: currentWorkout.session_id,
      workout_id: currentWorkout.id,
      completed_at: new Date().toISOString()
    });

    const { data: sessionSets, error: sessionError } = await supabase
      .from("sets")
      .select("exercise_id, reps, weight, session_id, sets")
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
    const exerciseIds = Object.keys(setsByExercise);
    let warmupMap = {};
    if (exerciseIds.length > 0) {
      const { data: exMeta } = await supabase
        .from("exercises")
        .select("id, has_warmup")
        .in("id", exerciseIds);
      (exMeta || []).forEach(ex => {
        warmupMap[ex.id] = !!ex.has_warmup;
      });
    }

    for (const exerciseId in setsByExercise) {
      const todaysSets = setsByExercise[exerciseId];

      const { data: previousSets } = await supabase
        .from("sets")
        .select("reps, weight, session_id, sets")
        .eq("exercise_id", exerciseId)
        .neq("session_id", currentWorkout.session_id);

      const isPB = isPBForSession(todaysSets, previousSets || [], warmupMap[exerciseId]);

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
    sessionHasSavedSets = false;
  };

  // ---------------- PREVIOUS WORKOUTS ----------------
  async function loadPreviousWorkouts(options = {}) {
    const { force = false, silent = false } = options;
    const list = document.getElementById("previous-workouts-list");
    if (!silent) {
      showPage("previous-workouts-page");
      document.getElementById("quote-previous").textContent = randomQuote();
      list.innerHTML = "Loading...";
    }

    if (!force && previousWorkoutsCache) {
      renderPreviousWorkouts(previousWorkoutsCache);
      refreshPreviousWorkoutsInBackground();
      return;
    }

    const { data: finishedSessions, error: finishedError } = await supabase
      .from("workout_sessions")
      .select("session_id, workout_id, completed_at")
      .order("completed_at", { ascending: false });

    if (finishedError) {
      console.error(finishedError);
      list.textContent = "Error loading previous sessions.";
      return;
    }

    if (!finishedSessions || finishedSessions.length === 0) {
      list.textContent = "No previous workouts logged yet.";
      return;
    }

    const finishedSessionIds = finishedSessions.map(s => s.session_id);
    const { data, error } = await supabase
      .from("sets")
      .select("session_id, workout_id, exercise_id, created_at, reps, weight, sets")
      .in("session_id", finishedSessionIds)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      list.textContent = "Error loading previous sessions.";
      return;
    }

    if (!data || data.length === 0) {
      list.textContent = "No previous workouts logged yet.";
      return;
    }

    // Group by session_id
    const sessions = {};
    (data || []).forEach(s => {
      if (!s.session_id) return;
      if (!sessions[s.session_id]) sessions[s.session_id] = { workout_id: s.workout_id, last: s.created_at, sets: [] };
      sessions[s.session_id].sets.push(s);
      if (new Date(s.created_at) > new Date(sessions[s.session_id].last)) sessions[s.session_id].last = s.created_at;
    });

    const sessionArr = Object.keys(sessions).map(id => ({ id, ...sessions[id] }));
    
    // Fetch workout names
    const workoutIds = Array.from(new Set(sessionArr.map(s => s.workout_id).filter(Boolean)));
    const exerciseIds = Array.from(new Set((data || []).map(s => s.exercise_id).filter(Boolean)));

    const [workoutsResult, exercisesResult] = await Promise.all([
      workoutIds.length > 0
        ? supabase.from("workouts").select("id, name").in("id", workoutIds)
        : Promise.resolve({ data: [] }),
      exerciseIds.length > 0
        ? supabase.from("exercises").select("id, name, has_warmup").in("id", exerciseIds)
        : Promise.resolve({ data: [] })
    ]);

    let workoutMap = {};
    (workoutsResult.data || []).forEach(x => {
      workoutMap[x.id] = x.name;
    });

    let exerciseMap = {};
    (exercisesResult.data || []).forEach(x => {
      exerciseMap[x.id] = x;
    });

    // Get all historical sets once for comparison
    const historicalByExercise = {};
    (data || []).forEach(s => {
      if (!historicalByExercise[s.exercise_id]) historicalByExercise[s.exercise_id] = [];
      historicalByExercise[s.exercise_id].push(s);
    });

    // Calculate PBs for each session
    for (const s of sessionArr) {
      const setsByExercise = {};
      s.sets.forEach(set => {
        if (!setsByExercise[set.exercise_id]) setsByExercise[set.exercise_id] = [];
        setsByExercise[set.exercise_id].push(set);
      });

      let pbCount = 0;
      let pbNames = [];
      for (const exerciseId in setsByExercise) {
        const todaysSets = setsByExercise[exerciseId];
        const sessionDate = new Date(s.last);
        const previousSets = (historicalByExercise[exerciseId] || []).filter(x => {
          return x.session_id !== s.id && new Date(x.created_at) < sessionDate;
        });

        const meta = exerciseMap[exerciseId] || {};
        const isPB = isPBForSession(todaysSets, previousSets, !!meta.has_warmup);
        if (isPB) {
          pbCount++;
          if (meta.name) pbNames.push(meta.name);
        }
      }
      s.pbCount = pbCount;
      s.pbNames = pbNames;
    }

    // Sort by last date desc
    sessionArr.sort((a, b) => new Date(b.last) - new Date(a.last));

    previousWorkoutsCache = { sessionArr, workoutMap, exerciseMap };
    renderPreviousWorkouts(previousWorkoutsCache);
  }

  async function refreshPreviousWorkoutsInBackground() {
    try {
      await loadPreviousWorkouts({ force: true, silent: true });
      if (currentSection === "previous-workouts" && previousWorkoutsCache) {
        renderPreviousWorkouts(previousWorkoutsCache);
      }
    } catch (err) {
      console.error(err);
    }
  }

  function formatSessionDate(dateValue) {
    const d = new Date(dateValue);
    if (Number.isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "2-digit" });
  }

  function buildSessionDetails(session, exerciseMap) {
    const wrapper = document.createElement("div");
    wrapper.className = "mt-3 text-sm";

    const pbSummary = document.createElement("div");
    pbSummary.className = "text-yellow-600";
    pbSummary.textContent = session.pbNames && session.pbNames.length
      ? `PBs: ${session.pbNames.length} (${session.pbNames.join(", ")})`
      : "PBs: 0";
    wrapper.appendChild(pbSummary);

    const grouped = new Map();
    (session.sets || []).forEach(set => {
      if (!grouped.has(set.exercise_id)) grouped.set(set.exercise_id, []);
      grouped.get(set.exercise_id).push(set);
    });

    grouped.forEach((sets, exerciseId) => {
      const block = document.createElement("div");
      block.className = "mt-3";

      const name = document.createElement("div");
      name.className = "font-semibold text-gray-700";
      name.textContent = (exerciseMap[exerciseId] && exerciseMap[exerciseId].name) || "Exercise";
      block.appendChild(name);

      const list = document.createElement("div");
      list.className = "mt-1 space-y-1 text-gray-600";

      sets
        .slice()
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
        .forEach(set => {
          const row = document.createElement("div");
          const setIndex = Number.isFinite(set.sets) ? set.sets + 1 : "";
          const label = setIndex ? `Set ${setIndex}` : "Set";
          row.textContent = `${label}: ${set.reps || 0} x ${set.weight || 0}kg`;
          list.appendChild(row);
        });

      block.appendChild(list);
      wrapper.appendChild(block);
    });

    return wrapper;
  }

  function renderPreviousWorkouts(cache) {
    const list = document.getElementById("previous-workouts-list");
    list.innerHTML = "";
    const sessionArr = cache.sessionArr || [];
    const workoutMap = cache.workoutMap || {};
    const exerciseMap = cache.exerciseMap || {};
    if (sessionArr.length === 0) {
      list.textContent = "No previous sessions found.";
      return;
    }

    sessionArr.forEach(s => {
      const div = document.createElement("div");
      div.className = "list-item p-3";

      const header = document.createElement("div");
      header.className = "flex items-center justify-between gap-3";

      const info = document.createElement("div");
      info.className = "flex flex-col";

      const title = document.createElement("div");
      title.className = "font-semibold text-lg";
      title.textContent = workoutMap[s.workout_id] || "Workout";

      const subtitle = document.createElement("div");
      subtitle.className = "text-sm text-gray-600";
      subtitle.textContent = formatSessionDate(s.last);

      info.appendChild(title);
      info.appendChild(subtitle);

      const pbSummary = document.createElement("div");
      pbSummary.className = "text-sm text-yellow-600";
      pbSummary.textContent = `PBs: ${s.pbCount || 0}`;

      const toggleBtn = document.createElement("button");
      toggleBtn.className = "btn-border btn-border-blue";
      toggleBtn.textContent = "Details";

      header.appendChild(info);
      header.appendChild(pbSummary);
      header.appendChild(toggleBtn);

      const details = document.createElement("div");
      details.className = "hidden";

      toggleBtn.onclick = () => {
        const isHidden = details.classList.contains("hidden");
        if (isHidden && !details.dataset.loaded) {
          details.appendChild(buildSessionDetails(s, exerciseMap));
          details.dataset.loaded = "true";
        }
        details.classList.toggle("hidden", !isHidden);
        toggleBtn.textContent = isHidden ? "Hide" : "Details";
      };

      div.appendChild(header);
      div.appendChild(details);
      list.appendChild(div);
    });
  }

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
  async function showSessionSummary(sessionSets, pbNames = [], fromPreviousWorkouts = false) {
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
    modal.style.maxHeight = "80vh";
    modal.style.overflow = "auto";
    modal.style.background = "#fff";
    modal.style.borderRadius = "10px";
    modal.style.boxShadow = "0 10px 40px rgba(0,0,0,0.25)";
    modal.style.padding = "min(18px, 4vw)";
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
      if (fromPreviousWorkouts) {
        loadPreviousWorkouts();
      } else {
        showFinishModal(pbNames, sessionSets);
      }
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
    if (!fromPreviousWorkouts) {
      row.appendChild(close);
    }
    modal.appendChild(row);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    (fromPreviousWorkouts ? back : close).focus();
  }
});
