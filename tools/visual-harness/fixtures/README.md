# Harness fixtures

These are real generated scripts (prompt, research-backed captions, generated models and scenes) kept as visual regression cases. Several are legacy outputs with known geometry defects, kept on purpose to show how the renderer copes with weak models.

| Fixture                   | What it exercises                                                                                            |
| ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `london-1666-street`      | Street frontage from one repeated house, burning frontage, night lamps, crane and pull-out town shots.       |
| `london-1666-riverfront`  | `coast` + `street` scenes, a landmark cathedral, open-city aftermath with organic settlement clusters.       |
| `london-1666-ruins`       | `structureState: ruined`, rubble settlements, fire and smoke on frontage.                                    |
| `pompeii-street-60s`      | A 60 s city street, low-angle cart, fountain and stepping-stone close-ups, dusk and night lighting.          |
| `pompeii-legacy-sparse`   | Legacy weak geometry (booth-sized shops): frontage density from a poor backdrop model.                       |
| `tower-bridge-waterfront` | `layout: open` urban river: a channel along the view, embankments and quays, a span across the flow, a ship. |
| `gutenberg-interior`      | `layout: interior`: a generated room shell, ceiling, bounce light, camera kept inside the walls.             |
| `gutenberg-street`        | The same event outdoors; tests that equipment stays readable on a street.                                    |
| `wright-flight`           | Aircraft: parked, take-off roll and climb-out, broadside framing, open coast without a road.                 |
| `wright-flight-legacy`    | Legacy dunes with base slabs: natural scenery must not be lined up in rows.                                  |
| `eiffel-construction`     | `city` + `open` construction site: settlement clusters from pavilions, unique landmark payoff shot.          |
| `jamestown-river`         | Legacy natural river across the view (must not become a town channel); a colonial post model.                |
| `columbus-classic`        | `presentation: classic` diorama framing, ships on the ocean, storm and fog.                                  |
