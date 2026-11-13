// Exports Mindustry content for Mindustry Lite. Not part of the game build: copy into tests/src/test/java/ and run
//   ./gradlew tests:test --tests MapExport -Dlite.out=/some/dir
// Writes <out>/<sector>.json for every Serpulo sector (tiles, buildings, spawns, rules, wave groups) and
// <out>/techtree.json (SerpuloTechTree nodes with research costs and objectives). Then run
//   python3 web/tools/compact_maps.py <out> web/tools/lite_names.json   and   python3 web/tools/gen_techtree.py
import arc.*;
import arc.files.*;
import arc.math.geom.*;
import arc.struct.*;
import arc.util.*;
import mindustry.*;
import mindustry.content.*;
import mindustry.content.TechTree.*;
import mindustry.core.*;
import mindustry.ctype.*;
import mindustry.game.*;
import mindustry.game.Objectives.*;
import mindustry.io.*;
import mindustry.maps.generators.*;
import mindustry.type.*;
import mindustry.world.*;
import org.junit.jupiter.api.*;

import static mindustry.Vars.*;

public class MapExport{
    static final String OUT = System.getProperty("lite.out", "lite-export");

    @BeforeAll
    static void launch(){ ApplicationTests.launchApplication(false); }

    @Test
    void techTree(){
        StringBuilder sb = new StringBuilder("[\n");
        walk(Planets.serpulo.techTree, sb);
        sb.setLength(sb.length() - 2);
        new Fi(OUT + "/techtree.json").writeString(sb.append("\n]\n").toString());
    }

    void walk(TechNode n, StringBuilder sb){
        sb.append("{\"name\":\"").append(n.content.name).append("\",\"type\":\"").append(n.content.getContentType().name())
          .append("\",\"parent\":").append(n.parent == null ? "null" : "\"" + n.parent.content.name + "\"").append(",\"req\":[");
        for(int i = 0; i < n.requirements.length; i++){
            sb.append(i > 0 ? "," : "").append("[\"").append(n.requirements[i].item.name).append("\",").append(n.requirements[i].amount).append("]");
        }
        sb.append("],\"obj\":[");
        boolean first = true;
        for(var o : n.objectives){
            String t = o instanceof Research r ? "research:" + r.content.name : o instanceof SectorComplete c ? "sector:" + c.preset.name : o instanceof OnSector s ? "on:" + s.preset.name : o.getClass().getSimpleName();
            sb.append(first ? "" : ",").append("\"").append(t).append("\"");
            first = false;
        }
        sb.append("]},\n");
        for(TechNode c : n.children) walk(c, sb);
    }

    @Test
    void sectors(){
        if(world == null) world = new World();
        for(SectorPreset sector : content.sectors()){
            if(sector.planet != Planets.serpulo) continue;
            Time.setDeltaProvider(() -> 1f);
            logic.reset();
            Reflect.<TaskQueue>get(arc.backend.headless.HeadlessApplication.class, Core.app, "runnables").clear();
            state.rules.sector = sector.sector;
            world.loadGenerator(sector.generator.map.width, sector.generator.map.height, tiles -> sector.generator.generate(tiles, new WorldParams()));
            sector.rules.get(state.rules);
            dumpOne(sector);
        }
    }

    void dumpOne(SectorPreset sector){
        Rules r = state.rules;
        int w = world.width(), h = world.height();
        StringBuilder fl = new StringBuilder(), ov = new StringBuilder(), bl = new StringBuilder(), builds = new StringBuilder();
        Seq<String> fp = new Seq<>(), op = new Seq<>(), bp = Seq.with("air");
        for(int y = 0; y < h; y++) for(int x = 0; x < w; x++){
            Tile t = world.tile(x, y);
            fl.append(idx(fp, t.floor().name)).append(',');
            ov.append(idx(op, t.overlay().name)).append(',');
            bl.append(t.build != null ? 0 : idx(bp, t.block().name)).append(',');
            if(t.build != null && t.isCenter()){
                Object cfg = null;
                try{ cfg = t.build.config(); }catch(Throwable e){}
                String cs = cfg instanceof UnlockableContent u ? "\"" + u.name + "\"" : cfg instanceof Number n ? n.toString() : cfg instanceof Boolean b ? b.toString() :
                    cfg instanceof Point2 pt ? "[" + pt.x + "," + pt.y + "]" : cfg instanceof Point2[] pts ? pts(pts) : "null";
                builds.append(builds.length() > 0 ? "," : "").append("[\"").append(t.team().name).append("\",\"").append(t.block().name).append("\",")
                    .append(x).append(',').append(y).append(',').append(t.build.rotation).append(',').append(cs).append(']');
            }
        }
        StringBuilder spawns = new StringBuilder(), loadout = new StringBuilder(), weather = new StringBuilder();
        for(Tile s : spawner.getSpawns()) spawns.append(spawns.length() > 0 ? "," : "").append('[').append(s.x).append(',').append(s.y).append(']');
        for(ItemStack s : r.loadout) loadout.append(loadout.length() > 0 ? "," : "").append("[\"").append(s.item.name).append("\",").append(s.amount).append(']');
        for(var we : r.weather) weather.append(weather.length() > 0 ? "," : "").append("[\"").append(we.weather.name).append("\",").append(we.minFrequency).append(',')
            .append(we.maxFrequency).append(',').append(we.minDuration).append(',').append(we.maxDuration).append(",").append(we.intensity).append(']');
        String out = "{\"name\":\"" + sector.name + "\",\"w\":" + w + ",\"h\":" + h + ",\"difficulty\":" + sector.difficulty + ",\"captureWave\":" + sector.captureWave +
            ",\"winWave\":" + r.winWave + ",\"attack\":" + r.attackMode + ",\"waves\":" + r.waves + ",\"waveTimer\":" + r.waveTimer + ",\"waveSpacing\":" + r.waveSpacing +
            ",\"initialWaveSpacing\":" + r.initialWaveSpacing + ",\"startWaveTimeMultiplier\":" + sector.startWaveTimeMultiplier + ",\"enemyCoreBuildRadius\":" + r.enemyCoreBuildRadius +
            ",\"loadout\":[" + loadout + "],\"weather\":[" + weather + "],\"spawns\":[" + spawns + "],\"builds\":[" + builds + "]" +
            ",\"floorPal\":" + pal(fp) + ",\"orePal\":" + pal(op) + ",\"blockPal\":" + pal(bp) +
            ",\"floor\":\"" + fl + "\",\"ore\":\"" + ov + "\",\"block\":\"" + bl + "\",\"groups\":" + JsonIO.write(r.spawns) + "}";
        new Fi(OUT + "/" + sector.name + ".json").writeString(out);
    }

    String pts(Point2[] p){ StringBuilder sb = new StringBuilder("["); for(int i = 0; i < p.length; i++) sb.append(i > 0 ? "," : "").append('[').append(p[i].x).append(',').append(p[i].y).append(']'); return sb.append(']').toString(); }
    int idx(Seq<String> pal, String n){ int i = pal.indexOf(n); if(i < 0){ pal.add(n); i = pal.size - 1; } return i; }
    String pal(Seq<String> p){ StringBuilder sb = new StringBuilder("["); for(int i = 0; i < p.size; i++) sb.append(i > 0 ? "," : "").append('"').append(p.get(i)).append('"'); return sb.append(']').toString(); }
}
