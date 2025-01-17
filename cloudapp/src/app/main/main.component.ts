import { Component, OnInit } from '@angular/core';
import { CloudAppEventsService, CloudAppRestService, Entity, EntityType, 
  HttpMethod, PageInfo, RestErrorResponse, Request, AlertService } from '@exlibris/exl-cloudapp-angular-lib';
import { map, catchError, switchMap, tap, mergeMap } from 'rxjs/operators';
import { of, forkJoin, Observable, Subscription, iif } from 'rxjs';
import { MatDialog } from '@angular/material/dialog';
import { ConfirmationDialogComponent } from '../confirmation-dialog/confirmation-dialog.component';
import { TranslateService } from '@ngx-translate/core';
//import { AppService } from '../app.service';

@Component({
  selector: 'app-main',
  templateUrl: './main.component.html',
  styleUrls: ['./main.component.scss']
})
export class MainComponent implements OnInit {

  num = 10;
  loading = true;
  processed = 0;
  showProgress = false;
  currentUserId;
  ids = new Set<string>();
  
  sets: Entity[];
  private pageLoad$: Subscription;
  

  constructor( 
    private restService: CloudAppRestService,
    private eventsService: CloudAppEventsService,
    private alert: AlertService ,
    private translate: TranslateService,
    //private appService: AppService,
    private dialog: MatDialog,
  ) { }

  ngOnInit() {
    //this.translate.get('Translate.Title').subscribe(text=>this.appService.setTitle(text));
    this.loading=true;
    //this.appService.setTitle('Parallel Requests');
    this.pageLoad$ = this.eventsService.onPageLoad(this.onPageLoad);
    
  }

  ngOnDestroy(): void {
    this.pageLoad$.unsubscribe();
  }
  onPageLoad = (pageInfo: PageInfo) => {    
    this.ids = new Set<string>();
    this.sets = [];
    this.laodReminders(pageInfo.entities);
    console.log(pageInfo.entities);
    
  }

  delete() {
    let idsArray = Array.from(this.ids);
    let setsArray : any = [...this.sets];
    console.log(this.ids)
    console.log(setsArray)


    const includesPublic = setsArray
          .filter(set => idsArray.findIndex(id=>id == set.id) > -1)
    console.log(includesPublic)
    // setup confirmation popup
    const dialogRef = this.dialog.open(ConfirmationDialogComponent, { autoFocus: false });
    dialogRef.componentInstance.deleteCount= idsArray.length;
    dialogRef.componentInstance.includesPublic= includesPublic;
    dialogRef.afterClosed().subscribe(result => {
      if (!result) return;
      this.deleteReminders();
    });

  }

  deleteReminders() {
    this.loading = true;
    this.processed = 0;
    let idsArray = Array.from(this.ids);
    let setsArray : any = [...this.sets];
    const reminders_to_delete = setsArray
          .filter(set => idsArray.findIndex(id=>id == set.id) > -1)
    of(reminders_to_delete)
    .pipe(
      switchMap(ids => {  
        this.loading=true;    
        return iif(
          ()=>ids.length>0,
          forkJoin(ids.map(e=>this.deleteReminder(e))),
          of(null)
        )
      }),
    )
    .subscribe({
      next: (s: any[])=>{
        if(!s) return null;
        s.forEach(set=>{
          if(!set) return null;
          // TODO confirm error reporting is working. 
          if (isRestErrorResponse(set)) {
            console.log('Error deleting set: ' + set.message)
          } 
        })
      },
      complete: () => {
        this.loading=false;
        this.ids = new Set<string>();
        this.eventsService.refreshPage().subscribe(
          ()=>this.alert.success(this.translate.instant('Translate.DeleteSuc'), {autoClose: false})
        );
      }
    });
    
  }

  deleteReminder(set: any) {
    // Extraire le lien complet de l'objet 'set'
    let link = set.link;
  
    // Supprimer la partie "/almaws/v1" du lien
    let cleanedLink = link.replace('/almaws/v1', '');
  
    // Créer la requête avec l'URL nettoyée
    let request: Request = {
      url: cleanedLink,  // Utiliser le lien nettoyé
      method: HttpMethod.DELETE
    };
  
    return this.restService.call<any>(request).pipe(
      tap(() => this.processed++),
      catchError(e => of(e))  // Gérer les erreurs
    );
  }

  laodReminders(sets: Entity[]) {
    this.loading=true;
    this.processed = 0;

    const sets$ = of(sets)
    .pipe(
      switchMap(entities => {  
        this.loading=true;    
        const items = entities.filter(e=>e.type==EntityType.REMINDER);
        console.log(items)
        return iif(
          ()=>items.length>0,
          forkJoin(items.map(e=>this.getSet(e))),
          of(null)
        )
      }),
    )

    this.eventsService.getInitData()
    .pipe(
      mergeMap(initData => {
        const currentUserId = initData.user.primaryId;
        return sets$
        .pipe(
          map(entities => {
            if(!entities) return [];
            return entities;  
          }
          )
        )                            
      }),
    )
    .subscribe({
      next: (s: any[])=>{
        if(!s) return null;
        s.forEach(set=>{
          if (isRestErrorResponse(set)) {
            console.log('Error retrieving set: ' + set.message)
          } else {
            this.sets.push(set);
          }
        })
      },
      complete: () => this.loading=false
    });

  }

  getSet(set: Entity) {
    return this.restService.call<any>(set.link).pipe(
      tap(()=>this.processed++),
      catchError(e => of(e)),
    )
  }


  get percentComplete() {
    return Math.round((this.processed/this.num)*100)
  }

  onEntitySelected(event) {
    console.log(event);
    if (event.checked) this.ids.add(event.mmsId);
    else this.ids.delete(event.mmsId);
  }

  setLang(lang: string) {
    this.translate.use(lang);
  }

}
const isRestErrorResponse = (object: any): object is RestErrorResponse => 'error' in object;
