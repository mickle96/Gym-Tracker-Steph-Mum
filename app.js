// ---------------- STATE ----------------
let currentWorkout = null;
let currentExercise = null;
let currentSection = "home";

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
    div.className = "p-3 border border-gray-600 rounded flex justify-between items-center hover:bg-gray-800 cursor-pointer";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = workout.name;
    nameSpan.className = "flex-1";
    nameSpan.onclick = () => loadExercises(workout);
    div.appendChild(nameSpan);

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "btn-border border-yellow-500 text-yellow-400 ml-2 text-sm";
    editBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt("Edit workout name", workout.name);
      if (!newName) return;
      await supabase.from("workouts").update({ name: newName }).eq("id", workout.id);
      loadWorkouts();
    };
    div.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️";
    delBtn.className = "btn-border border-red-500 text-red-400 ml-2 text-sm";
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

document.getElementById("create-workout-btn").onclick = async () => {
  const name = prompt("Workout name");
  if (!name) return;
  await supabase.from("workouts").insert({ name });
  loadWorkouts();
};

// ---------------- VIEW EXERCISES ----------------
async function loadExercises(workout) {
  currentWorkout = workout;
  currentSection = "view-exercises";

  showPage("view-exercises-page");
  document.getElementById("selected-workout-title").textContent = workout.name;
  document.getElementById("quote-exercises").textContent = randomQuote();

  const { data: exercises } = await supabase
    .from("exercises")
    .select("*")
    .eq("workout_id", workout.id);

  const list = document.getElementById("exercises-list");
  list.innerHTML = "";

  for (const ex of exercises) {
    const { data: allSets } = await supabase
      .from("sets")
      .select("*")
      .eq("exercise_id", ex.id)
      .order("created_at", { ascending: true });

    let pb = { weight: 0, reps: 0, total: 0 };
    allSets.forEach(s => {
      const total = s.reps * s.weight;
      if (s.weight > pb.weight || (s.weight === pb.weight && total > pb.total)) {
        pb = { weight: s.weight, reps: s.reps, total };
      }
    });

    const div = document.createElement("div");
    div.className = "p-3 border border-gray-600 rounded flex justify-between items-center hover:bg-gray-800";

    const nameSpan = document.createElement("span");
    nameSpan.textContent = ex.name;
    nameSpan.className = "flex-1";
    div.appendChild(nameSpan);

    const pbSpan = document.createElement("span");
    pbSpan.textContent = (pb.weight === 0 && pb.reps === 0) ? "PB: —" : `PB: ${pb.weight}kg × ${pb.reps}`;
    pbSpan.className = "text-yellow-400 font-bold ml-2";
    div.appendChild(pbSpan);

    const editBtn = document.createElement("button");
    editBtn.textContent = "✏️";
    editBtn.className = "btn-border border-yellow-500 text-yellow-400 ml-2 text-sm";
    editBtn.onclick = async (e) => {
      e.stopPropagation();
      const newName = prompt("Edit exercise name", ex.name);
      if (!newName) return;
      await supabase.from("exercises").update({ name: newName }).eq("id", ex.id);
      loadExercises(workout);
    };
    div.appendChild(editBtn);

    const delBtn = document.createElement("button");
    delBtn.textContent = "🗑️";
    delBtn.className = "btn-border border-red-500 text-red-400 ml-2 text-sm";
    delBtn.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm("Delete this exercise?")) return;
      await supabase.from("exercises").delete().eq("id", ex.id);
      loadExercises(workout);
    };
    div.appendChild(delBtn);

    list.appendChild(div);
  }
}

document.getElementById("add-exercise-btn").onclick = async () => {
  const name = prompt("Exercise name");
  if (!name) return;
  await supabase.from("exercises").insert({ name, workout_id: currentWorkout.id });
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
    div.className = "p-3 border border-gray-600 rounded cursor-pointer hover:bg-gray-800 transition-colors";
    div.textContent = workout.name;
    div.onclick = () => startWorkoutSession(workout);
    list.appendChild(div);
  });

  document.getElementById("finish-workout-btn").classList.add("hidden");
}

// ---------------- START WORKOUT SESSION ----------------
function startWorkoutSession(workout) {
  currentWorkout = {
    ...workout,
    session_id: crypto.randomUUID() // NEW session for this start
  };
  loadWorkoutExercises(currentWorkout);
}

// ---------------- WORKOUT EXERCISES ----------------
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

  exercises.forEach(ex => {
    const div = document.createElement("div");
    div.className = "p-3 border border-gray-600 rounded cursor-pointer hover:bg-gray-800";
    div.textContent = ex.name;
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

  const { data: lastSets } = await supabase
    .from("sets")
    .select("*")
    .eq("exercise_id", ex.id)
    .order("created_at", { ascending: false })
    .limit(4);

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
  headerDiv.className = "flex items-center gap-2 mb-2 font-semibold text-gray-300";
  headerDiv.innerHTML = `
    <span class="w-20"></span>
    <div class="w-16 text-center">Reps</div>
    <div class="w-16 text-center">Kg</div>
    <div class="flex-1 text-right">Previous</div>
  `;
  setsContainer.appendChild(headerDiv);

  for (let i = 0; i < 4; i++) {
    const lastSet = lastSets.find(s => s.sets === i);
    const prevText = lastSet ? `${lastSet.reps} × ${lastSet.weight}kg` : '-';

    const div = document.createElement("div");
    div.className = "flex items-center gap-2 mb-1";
    div.innerHTML = `
      <span class="font-bold w-20">${i === 0 ? "Warm-up" : "Set " + i}:</span>
      <input type="number" placeholder="Reps" class="w-16 p-1 text-center">
      <input type="number" placeholder="Kg" class="w-16 p-1 text-center">
      <div class="flex-1 text-right text-gray-400 text-sm">${prevText}</div>
    `;
    setsContainer.appendChild(div);
  }

  // ---------------- SAVE NOTE + SETS ----------------
  document.getElementById("save-exercise-note").onclick = async () => {
    if (!currentExercise || !currentWorkout || !currentWorkout.session_id) return;

    const setsDivs = Array.from(document.getElementById("sets-container").children).slice(1);
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

    alert("Saved!");
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

  let message = "Workout finished!\n";
  if (pbExercises.length === 0) {
    message += "No PBs today.";
  } else {
    const { data: names } = await supabase
      .from("exercises")
      .select("id, name")
      .in("id", pbExercises);

    const list = names.map(n => `• ${n.name}`).join("\n");
    message += `PBs today: ${pbExercises.length}\n\n${list}`;
  }

  alert(message);

  // Reset to home
  currentWorkout = null;
  currentSection = "home";
  showPage("home-page");
};
