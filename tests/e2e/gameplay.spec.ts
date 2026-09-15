import { test, expect } from "@playwright/test";

test.describe("Fields of Normandy - Jugabilidad E2E Misión 01", () => {
  test("desbloqueo, visualización del bosque, órdenes, revelado, finalización de activación y combate", async ({
    page,
  }) => {
    page.on("console", (msg) => console.log("PAGE LOG:", msg.text()));
    page.on("pageerror", (err) => console.log("PAGE ERROR:", err));

    // 1. Acceder al sitio
    await page.goto("./");

    // Verificar pantalla de bloqueo
    const lockScreen = page.locator("#lock-screen");
    await expect(lockScreen).toBeVisible();

    // Intentar clave errónea
    await page.fill("#lock-pin", "0000");
    await page.click('#lock-form button[type="submit"]');
    const lockError = page.locator("#lock-error");
    await expect(lockError).toBeVisible();

    // Introducir PIN correcto (1944)
    await page.fill("#lock-pin", "1944");
    await page.click('#lock-form button[type="submit"]');
    await expect(lockScreen).toBeHidden();

    // 2. Comprobar interfaz del juego cargada
    const app = page.locator("#app");
    await expect(app).toBeVisible();
    await expect(page.locator("#mission-title")).toContainText("Misión 01");

    // 3. Comprobar que el bosque está claramente representado con árboles
    const trees = page.locator(".woods-trees");
    await expect(trees.first()).toBeAttached();
    const countTrees = await trees.count();
    // Hexágonos de bosque 1, 2, 3, 4, 5, 9 (al menos 6 hexágonos con árboles)
    expect(countTrees).toBeGreaterThanOrEqual(6);

    // 4. Probar diálogo de tutorial "¿Cómo jugar?"
    await page.click("#btn-open-tutorial");
    const tutorialModal = page.locator("#tutorial-modal");
    await expect(tutorialModal).toBeVisible();
    await page.click("#btn-close-tutorial");
    await expect(tutorialModal).toBeHidden();

    // 5. Comprobar fichas iniciales
    const unitA = page.locator('circle[data-piece-id="GB-A"]');
    const unitB = page.locator('circle[data-piece-id="GB-B"]');
    const unitGerman = page.locator('circle[data-piece-id="DE-UNK-1"]');

    await expect(unitA).toBeVisible();
    await expect(unitB).toBeVisible();
    await expect(unitGerman).toBeVisible();

    // 6. Activar Escuadra A
    const btnActivate = page.locator("#btn-activate");
    await expect(btnActivate).toBeEnabled();
    await btnActivate.click();

    // Diálogo de dados
    const diceModal = page.locator("#dice-modal");
    await expect(diceModal).toBeVisible();

    // Seleccionar dados manuales: [3, 5]
    await page.click("input[name='dice-mode'][value='manual']");
    await page.fill("#die-1", "3");
    await page.fill("#die-2", "5");
    await page.click("#btn-confirm-roll");

    // Elegir Fila 3 (Avanzar y Cobertura)
    const choiceCard3 = page.locator(".choice-card:has-text('Fila 3')");
    await expect(choiceCard3).toBeVisible();
    await choiceCard3.click();

    await expect(diceModal).toBeHidden();

    // 7. Verificar que el banner de órdenes muestra Avanzar y Cobertura
    const orderBanner = page.locator("#order-banner");
    await expect(orderBanner).toBeVisible();
    await expect(orderBanner).toContainText("Avanzar");
    await expect(orderBanner).toContainText("Cobertura");

    // Verificar que los hexágonos adyacentes tienen la clase movable-target
    const movableHex = page.locator('polygon[data-hex-id="M01-H07"]');
    await expect(movableHex).toHaveClass(/movable-target/);

    // 8. Avanzar al hexágono 7 haciendo clic en el hexágono
    await movableHex.click({ force: true });

    // Verificar que GB-A se ha movido al hexágono 7
    await expect(page.locator("#selection-details")).toContainText("Hexágono H07");

    // Verificar que la unidad alemana en H04 ha sido revelada automáticamente por proximidad
    await expect(page.locator('circle[data-piece-id="DE-UNK-1"]')).toHaveClass(/visibility-revealed/);
    // Y verificar que la etiqueta muestra LMG en lugar del antiguo DE
    await expect(page.locator('text.piece-label:has-text("LMG")')).toBeVisible();
    await expect(page.locator("#log-content")).toContainText("revelado");

    // 9. Ejecutar orden de Cobertura
    const btnCover = page.locator("#btn-cover");
    await expect(btnCover).toBeEnabled();
    await btnCover.click();
    await expect(page.locator("#selection-details")).toContainText("Cobertura: +1");

    // 10. Concluir activación de Escuadra A
    const btnConclude = page.locator("#btn-conclude");
    await expect(btnConclude).toBeEnabled();
    await btnConclude.click();

    // 11. Ahora Escuadra B debe estar lista para activar
    await expect(btnActivate).toBeEnabled();
    await expect(page.locator("#selection-details")).toContainText("GB-B");

    // 12. Terminar fase británica y comprobar que NO hay victoria falsa
    const btnGermanPhase = page.locator("#btn-german-phase");
    await expect(btnGermanPhase).toBeEnabled();
    await btnGermanPhase.click();

    // Comprobar diálogo modal con los resultados de la fase alemana y cerrarlo
    const germanPhaseModal = page.locator("#german-phase-modal");
    await expect(germanPhaseModal).toBeVisible();
    await page.click("#btn-german-phase-ok");
    await expect(germanPhaseModal).toBeHidden();

    // Comprobar que el turno avanza al turno 2
    const pipTurn2 = page.locator('.pip[data-turn="2"]');
    await expect(pipTurn2).toHaveClass(/active/);

    // Comprobar que el diálogo de fin de partida NO ha saltado
    const gameOverModal = page.locator("#game-over-modal");
    await expect(gameOverModal).toBeHidden();
  });

  test("tirada de dobles [3, 3] ofrece aceptar fila o relanzar según regla oficial de Mike Lambo", async ({
    page,
  }) => {
    await page.goto("./");
    await page.fill("#lock-pin", "1944");
    await page.click('#lock-form button[type="submit"]');

    // 1. Activar GB-A con dobles [3, 3]
    const btnActivate = page.locator("#btn-activate");
    await btnActivate.click();
    await page.click("input[name='dice-mode'][value='manual']");
    await page.fill("#die-1", "3");
    await page.fill("#die-2", "3");
    await page.click("#btn-confirm-roll");

    // 2. Comprobar que aparecen las opciones de dobles
    const acceptCard = page.locator(".choice-card:has-text('Aceptar Fila 3')");
    const rerollCard = page.locator(".choice-card:has-text('Relanzar dados')");
    await expect(acceptCard).toBeVisible();
    await expect(rerollCard).toBeVisible();

    // 3. Aceptar Fila 3 (Avanzar y Cobertura)
    await acceptCard.click();
    await expect(page.locator("#dice-modal")).toBeHidden();

    // 4. Ejecutar Avanzar a H07
    const movableHex = page.locator('polygon[data-hex-id="M01-H07"]');
    await movableHex.click({ force: true });

    // 5. Ejecutar Cobertura
    const btnCover = page.locator("#btn-cover");
    await expect(btnCover).toBeEnabled();
    await btnCover.click();

    // 6. Concluir activación de A
    const btnConclude = page.locator("#btn-conclude");
    await expect(btnConclude).toBeEnabled();
    await btnConclude.click();

    // 7. Tras concluir, ningún hexágono debe tener la clase movable-target
    const highlightedHexes = page.locator(".movable-target");
    await expect(highlightedHexes).toHaveCount(0);

    // 8. Seleccionar GB-B: no debe mostrar casillas de GB-A y debe poder activarse
    const unitB = page.locator('circle[data-piece-id="GB-B"]');
    await unitB.click({ force: true });
    await expect(page.locator("#selection-details")).toContainText("GB-B");
    await expect(page.locator(".movable-target")).toHaveCount(0);
    await expect(btnActivate).toBeEnabled();

    // 9. Probar botón de copiar registro
    const btnCopyLog = page.locator("#btn-copy-log");
    await expect(btnCopyLog).toBeVisible();
  });
});
