use engine::{br, cfr::{DcfrParams, Solver}, config::{SolveConfig, Sizings, Rake}, game::Game, nlhe::NlheGame};

fn spot(percent: f64) -> SolveConfig {
    let mut c = SolveConfig::default();
    c.board = "Ks 7d 2c 8h 3d".into();
    c.oop_range = "KK:0.7,A4s:0.25,A5s:0.8".into();
    c.ip_range = "TT:0.4,JJ".into();
    c.starting_pot=10.0; c.effective_stack=20.0;
    c.rake=Rake { percent, cap:3.0 };
    c.sizings.oop.river.bet=Sizings::new(&[100.0],false);
    c.sizings.ip.river.bet=Sizings::new(&[100.0],false);
    c.sizings.ip.river.raise=Sizings::new(&[],true);
    c
}

#[test]
fn raked_report_is_weighted_unilateral_gain_not_br_sum() {
    let c=spot(5.0); let mut s=Solver::new(NlheGame::new(&c).unwrap());
    assert!(!s.game().zero_sum());
    s.run(25,&DcfrParams::from_config(&c),0,|_,_,_|{});
    let r=s.exploitability(); let p=s.average();
    let ev=[br::expected_value(s.game(),0,&p),br::expected_value(s.game(),1,&p)];
    let expected=(r.br[0]-ev[0])+(r.br[1]-ev[1]);
    assert!((r.chips-expected).abs()<1e-6);
    assert!(r.br[0]+r.br[1]<0.0,"old metric must reproduce false convergence: {r:?}");
    assert!(r.pct_of_pot>0.01,"corrected profile must still need iterations: {r:?}");
    assert!(ev[0]+ev[1]<0.0);
    let mut iterations=25;
    while iterations<4000 && s.exploitability().pct_of_pot>0.01 {
        s.run(25,&DcfrParams::from_config(&c),25,|_,chips,pct| {
            assert!(chips>=-1e-5 && pct>=-1e-4);
        }); iterations+=25;
    }
    assert!(iterations>25);
    assert!(s.exploitability().pct_of_pot<=0.01,"final {:?}",s.exploitability());
}

#[test]
fn rake_free_report_retains_bit_exact_fast_path() {
    let c=spot(0.0);let mut s=Solver::new(NlheGame::new(&c).unwrap());
    assert!(s.game().zero_sum());
    s.run(100,&DcfrParams::from_config(&c),0,|_,_,_|{});
    let r=s.exploitability();
    assert_eq!(r.chips.to_bits(),(r.br[0]+r.br[1]).to_bits());
    let p=s.average();let expected=(r.br[0]-br::expected_value(s.game(),0,&p))+(r.br[1]-br::expected_value(s.game(),1,&p));
    assert!((r.chips-expected).abs()<1e-5);
}
