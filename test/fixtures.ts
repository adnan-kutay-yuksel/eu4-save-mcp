/** Synthetic EU4 saves that mirror the real file structure (for tests). */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";

const META = `date=1550.3.1
save_game="test.eu4"
player="FRA"
displayed_country_name="France"
savegame_version={
	first=1
	second=37
	third=5
	forth=0
	name="Inheritance"
}
savegame_versions={
	"1.37.5.0"
}
dlc_enabled={
	"Conquest of Paradise"
	"Art of War"
	"Common Sense"
}
multi_player=no
not_observer=yes
campaign_id="7f1c-test"
campaign_length=38000
`;

const GAMESTATE = `players_countries={
	"Player One"
	"FRA"
}
gameplaysettings={
	setgameplayoptions={
		1 1 0 0
	}
}
map_area_data{
	ile_de_france_area={
		state={
			area=ile_de_france_area
			country_state={ country="FRA" prosperity=100.000 }
		}
	}
}
income_statistics={
	ledger_data={
		name="FRA"
		data={
			1445=120 1500=360 1549=600
		}
	}
	ledger_data={
		name="ENG"
		data={
			1445=100 1549=480
		}
	}
}
rebel_faction={
	id={ id=1 type=50 }
	type="peasant_rebels"
	name="Lorraine Peasants"
	progress=62.000
	country="FRA"
	province=170
}
provinces={
	-183={
		name="Paris"
		owner="FRA"
		controller="FRA"
		cores={
			"FRA"
		}
		culture=cosmopolitan_french
		religion=catholic
		capital="Paris"
		is_city=yes
		base_tax=12.000
		base_production=10.000
		base_manpower=8.000
		trade_goods=cloth
		local_autonomy=0.000
		trade_power=25.500
		center_of_trade=2
		buildings={
			marketplace=yes
			temple=yes
		}
		history={
			base_tax=5
			1444.11.11={ owner="FRA" }
		}
		discovered_by={ "FRA" "ENG" }
	}
	-170={
		name="Lorraine"
		owner="FRA"
		controller="FRA"
		cores={
			"LOR"
		}
		culture=lorrain
		religion=reformed
		base_tax=4.000
		base_production=3.000
		base_manpower=2.000
		trade_goods=wine
		local_autonomy=25.000
	}
	-200={
		name="Calais"
		owner="FRA"
		controller="ENG"
		cores={
			"FRA" "ENG"
		}
		culture=english
		religion=catholic
		base_tax=3.000
		base_production=4.000
		base_manpower=2.000
		trade_goods=wool
		devastation=15.000
	}
	-236={
		name="London"
		owner="ENG"
		controller="ENG"
		cores={
			"ENG"
		}
		culture=english
		religion=catholic
		base_tax=10.000
		base_production=12.000
		base_manpower=6.000
		trade_goods=cloth
	}
	-1={
		name="Stockholm"
		owner="SWE"
		controller="SWE"
		cores={ "SWE" }
		culture=swedish
		religion=catholic
		base_tax=5.000
		base_production=5.000
		base_manpower=3.000
		trade_goods=grain
	}
}
countries={
	--- = {
	}
	REB={
		num_of_cities=0
	}
	FRA={
		human=yes
		was_player=yes
		government_rank=2
		government={
			government=monarchy
			reform_stack={
				reforms={
					"monarchy_mechanic" "french_absolutism_reform"
				}
			}
		}
		technology={
			adm_tech=10
			dip_tech=9
			mil_tech=8
		}
		institutions={
			1 1 0 0 0 0 0
		}
		capital=183
		num_of_cities=3
		treasury=150.500
		inflation=6.200
		corruption=1.100
		stability=0.000
		prestige=45.200
		legitimacy=40.000
		war_exhaustion=6.500
		overextension_percentage=0.600
		manpower=8.500
		max_manpower=40.000
		sailors=1200.000
		max_sailors=5000.000
		army_tradition=30.000
		navy_tradition=5.000
		army_professionalism=0.150
		mercantilism=12.000
		development=46.000
		raw_development=46.000
		great_power_score=600.000
		is_great_power=yes
		religion=catholic
		primary_culture=cosmopolitan_french
		accepted_culture=gascon
		powers={
			950 300 120
		}
		active_idea_groups={
			FRA_ideas=3
			aristocracy_ideas=7
			offensive_ideas=2
		}
		ledger={
			income={ 10 20 }
			lastmonthincome=12.500
			lastmonthincometable={
				4.000 2.500 3.000 0.000 0.000 1.000 0.000 0.000 0.000 0.000 0.000 2.000
			}
			lastmonthexpense=14.000
			lastmonthexpensetable={
				1.000 2.500 0.500 0.000 0.000 0.000 7.000 1.500 1.500
			}
			totalexpensetable={
				100.000 50.000 20.000 0.000 0.000 0.000 600.000 80.000 70.000
			}
			lastyearincome=150.000
			lastyearexpense=160.000
		}
		loan={
			id={ id=11 type=4713 }
			lender="---"
			interest=4.000
			fixed_interest=yes
			amount=200
			expiry_date=1552.1.1
		}
		loan={
			id={ id=12 type=4713 }
			lender="---"
			interest=4.000
			amount=200
			expiry_date=1553.1.1
		}
		estate={
			type="estate_nobles"
			loyalty=20.000
			influence=55.000
		}
		estate={
			type="estate_church"
			loyalty=60.000
			influence=85.000
		}
		rival={
			country="ENG"
			date="1500.1.1"
		}
		subjects={
			"PRO"
		}
		active_relations={
			ENG={
				attitude=attitude_rivalry
				cached_sum=-120
			}
			CAS={
				cached_sum=150
				trust=70.000
			}
		}
		history={
			1444.11.11={
				monarch={
					name="Charles VII"
					country="FRA"
					DIP=4
					ADM=5
					MIL=3
					id={ id=5 type=48 }
					dynasty="de Valois"
					birth_date=1403.2.22
				}
			}
			1540.5.1={
				monarch={
					name="Louis XII"
					country="FRA"
					DIP=2
					ADM=6
					MIL=1
					id={ id=77 type=48 }
					dynasty="de Valois"
					birth_date=1485.1.1
					personality="careful_personality"
				}
			}
		}
		monarch={
			id=77
			type=48
		}
		army={
			id={ id=100 type=54 }
			name="1st Army"
			location=183
			regiment={
				id={ id=1 type=54 }
				name="Paris Infantry"
				home=183
				type="french_caracolle"
				morale=3.000
				strength=1.000
			}
			regiment={
				id={ id=2 type=54 }
				name="Paris Infantry 2"
				type="western_men_at_arms"
				morale=3.000
				strength=0.400
			}
			regiment={
				id={ id=3 type=54 }
				name="Paris Cav"
				type="chevauchee"
				morale=3.000
				strength=1.000
			}
		}
		navy={
			id={ id=200 type=54 }
			name="Atlantic Fleet"
			location=183
			ship={
				type="carrack"
				name="La Couronne"
			}
			ship={
				type="barque"
				name="Le Sauveur"
			}
		}
	}
	ENG={
		government_rank=2
		technology={
			adm_tech=9
			dip_tech=10
			mil_tech=12
		}
		capital=236
		num_of_cities=2
		treasury=300.000
		stability=2.000
		prestige=50.000
		manpower=30.000
		max_manpower=35.000
		development=37.000
		religion=catholic
		primary_culture=english
		ledger={
			lastmonthincome=15.000
		}
		army={
			id={ id=101 type=54 }
			name="Royal Army"
			location=236
			regiment={ type="western_longbow" strength=1.000 morale=3.0 }
			regiment={ type="western_longbow" strength=1.000 morale=3.0 }
			regiment={ type="western_longbow" strength=1.000 morale=3.0 }
			regiment={ type="western_longbow" strength=1.000 morale=3.0 }
		}
		rival={
			country="FRA"
		}
	}
	SWE={
		government_rank=2
		technology={ adm_tech=8 dip_tech=8 mil_tech=9 }
		num_of_cities=1
		development=13.000
		treasury=20.000
		religion=catholic
	}
	PRO={
		government_rank=1
		num_of_cities=1
		development=9.000
		liberty_desire=55.000
		overlord="FRA"
		technology={ adm_tech=8 dip_tech=8 mil_tech=8 }
	}
	CAS={
		government_rank=2
		num_of_cities=4
		development=40.000
		technology={ adm_tech=9 dip_tech=9 mil_tech=9 }
	}
}
active_war={
	name="Anglo-French War"
	history={
		name="Anglo-French War"
		1549.1.1={
			add_attacker="FRA"
			add_defender="ENG"
		}
		1549.5.1={
			battle={
				name="Calais"
				location=200
				result=no
			}
		}
	}
	attackers={
		"FRA"
	}
	defenders={
		"ENG"
	}
	original_attacker="FRA"
	original_defender="ENG"
	participants={
		value=50.000
		tag="FRA"
		losses={ members={ 1000 200 0 } }
	}
	participants={
		value=40.000
		tag="ENG"
		losses={ members={ 3000 } }
	}
}
diplomacy={
	dependency={
		first="FRA"
		second="PRO"
		start_date=1500.1.1
		subject_type="vassal"
	}
	alliance={
		first="FRA"
		second="CAS"
		start_date=1520.1.1
	}
	royal_marriage={
		first="FRA"
		second="CAS"
	}
	guarantee={
		first="FRA"
		second="SWE"
	}
}
`;

export function eu4TextSave(): Buffer {
  return Buffer.from(`EU4txt\n${META}${GAMESTATE}`, "latin1");
}

// ---- minimal zip writer (deflate) ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export function makeZip(entries: Record<string, Buffer>, prefix = Buffer.alloc(0)): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const [name, data] of Object.entries(entries)) {
    const comp = zlib.deflateRawSync(data);
    const nameBuf = Buffer.from(name);
    const crc = crc32(data);
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(0, 6); lh.writeUInt16LE(8, 8);
    lh.writeUInt32LE(crc, 14); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26); lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, comp);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc, 16); ch.writeUInt32LE(comp.length, 20); ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28); ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += 30 + nameBuf.length + comp.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(Object.keys(entries).length, 8); eocd.writeUInt16LE(Object.keys(entries).length, 10);
  eocd.writeUInt32LE(cd.length, 12); eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([prefix, ...locals, cd, eocd]);
}

export function eu4ZipSave(): Buffer {
  return makeZip({
    meta: Buffer.from(`EU4txt\n${META}`, "latin1"),
    gamestate: Buffer.from(`EU4txt\n${GAMESTATE}`, "latin1"),
    ai: Buffer.from("EU4txt\nai={}", "latin1"),
  });
}

/** Write fixture saves to a fresh temp folder and return their paths. */
export function writeFixtures() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "eu4-mcp-test-"));
  const text = path.join(dir, "France_text.eu4");
  const zip = path.join(dir, "France_zip.eu4");
  const bin = path.join(dir, "Ironman.eu4");
  fs.writeFileSync(text, eu4TextSave());
  fs.writeFileSync(zip, eu4ZipSave());
  fs.writeFileSync(bin, Buffer.concat([Buffer.from("EU4bin"), Buffer.alloc(64, 1)]));
  // make the text save the newest
  const now = Date.now() / 1000;
  fs.utimesSync(bin, now - 300, now - 300);
  fs.utimesSync(zip, now - 200, now - 200);
  fs.utimesSync(text, now - 100, now - 100);
  return { dir, text, zip, bin };
}
